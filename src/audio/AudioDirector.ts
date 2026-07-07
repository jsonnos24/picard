// src/audio/AudioDirector.ts
// The ONLY file that touches AudioContext lifecycle. Every public method
// must no-op safely when the context is missing, suspended, or construction
// failed — the verify skill drives window.__game.frame(t) with synthetic
// KeyboardEvents (never a real user gesture), so the context stays
// "suspended" forever in that mode. The one exception is audioDebug()'s cue
// ring buffer, which records cues unconditionally (frame() must log cues
// even while fully inert) — that's how headless verify asserts audio fired.
import type { Cue } from "../game/feel/audioCues";
import type { Levels } from "../game/feel/audioLevels";
import type { Mood } from "../game/feel/musicBed";
import { playCue, uiClick as uiClickPatch } from "./patches";
import { createLayers, applyLevels, Layers } from "./layers";
import { createMusic, Music } from "./music";

const CUE_RING_SIZE = 50;
const MUTE_RAMP = 0.05; // seconds
const MUSIC_RAMP = 0.3; // seconds

export interface CueLogEntry {
  t: number;
  cue: string;
}

export interface AudioDebug {
  cues: CueLogEntry[];
  levels: Levels | null;
  contextState: string;
}

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private layersBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private layers: Layers | null = null;
  private music: Music | null = null;

  private muted = false;
  private masterVolume = 1;
  private wasRunningBeforeSuspend = false;
  private unlockListenersActive = false;

  // Headless-safe clock for the cue ring buffer: driven purely by frame()'s
  // dt, independent of ctx (which may be null or frozen at a suspended
  // currentTime) so audioDebug() timestamps stay meaningful either way.
  private elapsed = 0;
  private readonly cueLog: CueLogEntry[] = [];
  private lastLevels: Levels | null = null;

  constructor() {
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = Ctor ? new Ctor() : null;
    } catch {
      this.ctx = null;
    }
    if (!this.ctx) return;

    try {
      const ctx = this.ctx;
      this.masterGain = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      this.sfxBus = ctx.createGain();
      this.layersBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(this.masterGain);
      this.layersBus.connect(this.masterGain);
      this.musicBus.connect(this.masterGain);
      this.masterGain.connect(compressor);
      compressor.connect(ctx.destination);
      this.layers = createLayers(ctx, this.layersBus);
      this.music = createMusic(ctx, this.musicBus);
    } catch {
      // Any graph-construction failure: fall back to fully unavailable so
      // every method below no-ops via the ctx/masterGain-null guards.
      this.ctx = null;
      this.masterGain = null;
      this.sfxBus = null;
      this.layersBus = null;
      this.musicBus = null;
      this.layers = null;
      this.music = null;
      return;
    }
    this.installUnlockListeners();
  }

  // One-time real-gesture listeners that resume a suspended context; remove
  // themselves once the context reports "running". Rejected resume()
  // promises are swallowed — a gesture arriving before the browser is ready
  // to unlock audio is not an error.
  private installUnlockListeners(): void {
    if (!this.ctx || this.unlockListenersActive) return;
    this.unlockListenersActive = true;
    const ctx = this.ctx;
    const onGesture = (): void => {
      ctx.resume().catch(() => {});
    };
    const remove = (): void => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      this.unlockListenersActive = false;
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    ctx.addEventListener("statechange", () => {
      if (ctx.state === "running") remove();
    });
  }

  // Dispatches one-shot patches for `cues`, lerps layer gains toward
  // `levels`, and steps the music clock — all guarded so a suspended/missing
  // context only ever records to the debug ring buffer, never more.
  frame(cues: Cue[], levels: Levels, mood: Mood, dt: number): void {
    if (dt <= 0) return;
    this.elapsed += dt;
    for (const cue of cues) {
      this.cueLog.push({ t: this.elapsed, cue });
      if (this.cueLog.length > CUE_RING_SIZE) this.cueLog.shift();
    }
    this.lastLevels = levels;

    if (!this.ctx || !this.masterGain || this.ctx.state !== "running") return;

    if (!this.muted && this.sfxBus) {
      const when = this.ctx.currentTime;
      for (const cue of cues) {
        try {
          playCue(cue, this.ctx, this.sfxBus, when);
        } catch {
          // A bad patch must never take down the frame loop.
        }
      }
    }

    if (this.layers) applyLevels(this.layers, levels, dt);
    this.music?.step(dt, mood);
  }

  // UI click blip (Phase B): fired straight from a DOM click handler, not
  // from a snapshot edge, so it deliberately bypasses the Cue/audioCues/
  // playCue pipeline — see patches.ts's uiClick doc comment. Same guard
  // order as frame(): the cue ring records unconditionally (headless verify
  // asserts on it with the context permanently "suspended"), the actual
  // patch only plays past that when the context is running and unmuted.
  uiClick(): void {
    this.cueLog.push({ t: this.elapsed, cue: "uiClick" });
    if (this.cueLog.length > CUE_RING_SIZE) this.cueLog.shift();

    if (!this.ctx || !this.masterGain || this.ctx.state !== "running") return;
    if (this.muted || !this.sfxBus) return;
    try {
      uiClickPatch(this.ctx, this.sfxBus, this.ctx.currentTime);
    } catch {
      // A bad patch must never throw out of a click handler.
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMasterGain();
  }

  setMusicEnabled(m: boolean): void {
    if (!this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    const target = m ? 1 : 0;
    try {
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
      this.musicBus.gain.linearRampToValueAtTime(target, now + MUSIC_RAMP);
    } catch {
      // Ramp scheduling against a torn-down/odd context state: no-op.
    }
  }

  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0 : this.masterVolume;
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(target, now + MUTE_RAMP);
    } catch {
      // Same as above: never let a ramp failure throw.
    }
  }

  // Suspend for backgrounding (tab hidden). Remembers whether it was
  // actually running so resumeFromBackground() never force-resumes a
  // context that was never unlocked in the first place.
  suspendForBackground(): void {
    if (!this.ctx) return;
    this.wasRunningBeforeSuspend = this.ctx.state === "running";
    if (this.ctx.state === "running") this.ctx.suspend().catch(() => {});
  }

  resumeFromBackground(): void {
    if (!this.ctx || !this.wasRunningBeforeSuspend) return;
    this.ctx.resume().catch(() => {});
  }

  // THIS MUST WORK HEADLESS: the verify skill reads audioDebug().cues to
  // assert the audio loop is firing, with the context stuck "suspended".
  audioDebug(): AudioDebug {
    return {
      cues: [...this.cueLog],
      levels: this.lastLevels,
      contextState: this.ctx ? this.ctx.state : "unavailable",
    };
  }
}
