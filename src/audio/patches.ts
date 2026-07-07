// src/audio/patches.ts
// One synthesized "patch" per Cue family — every function is
// (ctx, dest, when) => void (warpChargeStart takes an extra durSec, per the
// brief). All-oscillator/noise, no binary assets. Tuning constants are
// exported per patch so a later pass can retune without touching the graph
// code. Never throws: playCue() is an exhaustive switch over Cue, and every
// individual patch only calls documented, always-legal WebAudio APIs (no
// throws even against a suspended AudioContext — scheduling is legal, it
// simply won't be heard until the context resumes).
import type { Cue } from "../game/feel/audioCues";
import { CHARGE_DUR } from "../game/feel/lightspeedSequence";
import { noiseBuffer } from "./noise";

// --- shared helpers (private) ----------------------------------------------

// Envelope-only gain node: silence -> attack -> peak -> release -> silence,
// wired to dest. Caller connects its source into the returned node.
function gainEnv(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  attack: number,
  release: number,
  peak: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + Math.max(0.001, attack));
  g.gain.linearRampToValueAtTime(0, when + Math.max(0.001, attack) + Math.max(0.001, release));
  g.connect(dest);
  return g;
}

// A short one-shot tone: attack fast, hold, then a linear fade to silence
// over durSec. Used for every "blip" style patch (UI sounds, arpeggios).
function blip(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  freq: number,
  durSec: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + Math.min(0.01, durSec / 4));
  g.gain.linearRampToValueAtTime(0, when + durSec);
  osc.connect(g);
  g.connect(dest);
  osc.start(when);
  osc.stop(when + durSec + 0.02);
}

// Hard-clip curve for WaveShaperNode-based distortion (touchdownHard, crash).
function clipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.max(-1, Math.min(1, x * amount));
  }
  return curve;
}

// --- launchClear -------------------------------------------------------
export const LAUNCH_CLEAR = {
  lowpassHz: 140,
  attack: 0.05,
  release: 2,
  subHz: 50,
  triad: [392, 494, 587] as const,
  triadGap: 0.08,
};

export function launchClear(ctx: AudioContext, dest: AudioNode, when: number): void {
  const dur = LAUNCH_CLEAR.attack + LAUNCH_CLEAR.release;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur + 0.1, "brown");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = LAUNCH_CLEAR.lowpassHz;
  const env = gainEnv(ctx, dest, when, LAUNCH_CLEAR.attack, LAUNCH_CLEAR.release, 0.6);
  noise.connect(lp);
  lp.connect(env);
  noise.start(when);
  noise.stop(when + dur + 0.1);

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = LAUNCH_CLEAR.subHz;
  const subEnv = gainEnv(ctx, dest, when, LAUNCH_CLEAR.attack, LAUNCH_CLEAR.release * 0.6, 0.4);
  sub.connect(subEnv);
  sub.start(when);
  sub.stop(when + dur + 0.1);

  LAUNCH_CLEAR.triad.forEach((f, i) =>
    blip(ctx, dest, when + i * LAUNCH_CLEAR.triadGap, f, 0.12, "triangle", 0.25),
  );
}

// --- ringCapture ---------------------------------------------------------
export const RING_CAPTURE = { f1: 440, f2: 660, decay: 0.4, bendSemitones: -2 };

export function ringCapture(ctx: AudioContext, dest: AudioNode, when: number): void {
  for (const f of [RING_CAPTURE.f1, RING_CAPTURE.f2]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, when);
    osc.frequency.exponentialRampToValueAtTime(
      f * Math.pow(2, RING_CAPTURE.bendSemitones / 12),
      when + RING_CAPTURE.decay,
    );
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + RING_CAPTURE.decay);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + RING_CAPTURE.decay + 0.02);
  }
}

// --- swingHoldStart --------------------------------------------------------
export const SWING_HOLD_START = { f1: 330, f2: 415, dur: 0.15 };

export function swingHoldStart(ctx: AudioContext, dest: AudioNode, when: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(SWING_HOLD_START.f1, when);
  osc.frequency.linearRampToValueAtTime(SWING_HOLD_START.f2, when + SWING_HOLD_START.dur);
  const g = gainEnv(ctx, dest, when, 0.01, SWING_HOLD_START.dur, 0.25);
  osc.connect(g);
  osc.start(when);
  osc.stop(when + SWING_HOLD_START.dur + 0.02);
}

// --- release / releasePerfect ----------------------------------------------
export const RELEASE = { pluckFreq: 523, pluckDecay: 0.3, whooshDur: 0.5, sweepFrom: 400, sweepTo: 1200 };

export function release(ctx: AudioContext, dest: AudioNode, when: number): void {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = RELEASE.pluckFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + RELEASE.pluckDecay);
  osc.connect(g);
  g.connect(dest);
  osc.start(when);
  osc.stop(when + RELEASE.pluckDecay + 0.02);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, RELEASE.whooshDur + 0.05, "white");
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1;
  bp.frequency.setValueAtTime(RELEASE.sweepFrom, when);
  bp.frequency.linearRampToValueAtTime(RELEASE.sweepTo, when + RELEASE.whooshDur);
  const wg = gainEnv(ctx, dest, when, 0.02, RELEASE.whooshDur - 0.02, 0.3);
  noise.connect(bp);
  bp.connect(wg);
  noise.start(when);
  noise.stop(when + RELEASE.whooshDur + 0.05);
}

export const RELEASE_PERFECT = {
  notes: [523, 659, 784, 1047] as const,
  gap: 0.09,
  noteDur: 0.15,
  sparkleDur: 0.3,
  hpHz: 6000,
};

export function releasePerfect(ctx: AudioContext, dest: AudioNode, when: number): void {
  RELEASE_PERFECT.notes.forEach((f, i) =>
    blip(ctx, dest, when + i * RELEASE_PERFECT.gap, f, RELEASE_PERFECT.noteDur, "triangle", 0.3),
  );
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, RELEASE_PERFECT.sparkleDur + 0.05, "white");
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = RELEASE_PERFECT.hpHz;
  const g = gainEnv(ctx, dest, when, 0.01, RELEASE_PERFECT.sparkleDur - 0.01, 0.2);
  noise.connect(hp);
  hp.connect(g);
  noise.start(when);
  noise.stop(when + RELEASE_PERFECT.sparkleDur + 0.05);
}

// --- breakaway ---------------------------------------------------------
export const BREAKAWAY = { freqFrom: 220, freqTo: 110, detuneCents: 25, dur: 0.3 };

export function breakaway(ctx: AudioContext, dest: AudioNode, when: number): void {
  for (const detune of [-BREAKAWAY.detuneCents, BREAKAWAY.detuneCents]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(BREAKAWAY.freqFrom, when);
    osc.frequency.exponentialRampToValueAtTime(BREAKAWAY.freqTo, when + BREAKAWAY.dur);
    osc.detune.value = detune;
    const g = gainEnv(ctx, dest, when, 0.01, BREAKAWAY.dur - 0.01, 0.25);
    osc.connect(g);
    osc.start(when);
    osc.stop(when + BREAKAWAY.dur + 0.02);
  }
}

// --- warpChargeStart / warpEngage / warpArrive / warpAbort ------------------
export const WARP_CHARGE = { freqFrom: 70, freqTo: 700 };

// Extra durSec param (brief-sanctioned exception): the sweep and noise swell
// span the full charge wind-up, whatever it is. Defaults to the real
// lightspeedSequence charge duration so a bare playCue() call still sounds
// right even though Game.ts's frame() call doesn't thread the duration
// through per-instance.
export function warpChargeStart(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  durSec: number = CHARGE_DUR,
): void {
  const d = Math.max(0.05, durSec);
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(WARP_CHARGE.freqFrom, when);
  osc.frequency.exponentialRampToValueAtTime(WARP_CHARGE.freqTo, when + d);
  const g = gainEnv(ctx, dest, when, d * 0.1, d * 0.9, 0.35);
  osc.connect(g);
  osc.start(when);
  osc.stop(when + d + 0.05);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, d + 0.1, "white");
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(200, when);
  bp.frequency.linearRampToValueAtTime(2000, when + d);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, when);
  ng.gain.linearRampToValueAtTime(0.25, when + d);
  ng.gain.linearRampToValueAtTime(0, when + d + 0.1);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  noise.start(when);
  noise.stop(when + d + 0.1);
}

export const WARP_ENGAGE = { dur: 0.6, sweepFrom: 8000, sweepTo: 200, subHz: 45, subDur: 0.5 };

export function warpEngage(ctx: AudioContext, dest: AudioNode, when: number): void {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, WARP_ENGAGE.dur + 0.05, "white");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(WARP_ENGAGE.sweepFrom, when);
  lp.frequency.exponentialRampToValueAtTime(WARP_ENGAGE.sweepTo, when + WARP_ENGAGE.dur);
  const g = gainEnv(ctx, dest, when, 0.02, WARP_ENGAGE.dur - 0.02, 0.5);
  noise.connect(lp);
  lp.connect(g);
  noise.start(when);
  noise.stop(when + WARP_ENGAGE.dur + 0.05);

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = WARP_ENGAGE.subHz;
  const sg = gainEnv(ctx, dest, when, 0.01, WARP_ENGAGE.subDur - 0.01, 0.6);
  sub.connect(sg);
  sub.start(when);
  sub.stop(when + WARP_ENGAGE.subDur + 0.05);
}

export const WARP_ARRIVE = { dur: 0.5, sweepFrom: 200, sweepTo: 4000, chime: [880, 1108] as const, chimeGap: 0.12 };

export function warpArrive(ctx: AudioContext, dest: AudioNode, when: number): void {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, WARP_ARRIVE.dur + 0.05, "white");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(WARP_ARRIVE.sweepFrom, when);
  lp.frequency.exponentialRampToValueAtTime(WARP_ARRIVE.sweepTo, when + WARP_ARRIVE.dur);
  const g = gainEnv(ctx, dest, when, 0.02, WARP_ARRIVE.dur - 0.02, 0.25);
  noise.connect(lp);
  lp.connect(g);
  noise.start(when);
  noise.stop(when + WARP_ARRIVE.dur + 0.05);

  WARP_ARRIVE.chime.forEach((f, i) => blip(ctx, dest, when + i * WARP_ARRIVE.chimeGap, f, 0.3, "sine", 0.25));
}

export const WARP_ABORT = { high: 311, low: 294, noteDur: 0.13, gap: 0.12 }; // Eb4 -> D4

export function warpAbort(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, WARP_ABORT.high, WARP_ABORT.noteDur, "square", 0.3);
  blip(ctx, dest, when + WARP_ABORT.gap, WARP_ABORT.low, WARP_ABORT.noteDur, "square", 0.3);
}

// --- touchdownSoft / touchdownHard / crash ----------------------------------
export const TOUCHDOWN = { freqFrom: 65, freqTo: 32, dur: 0.3, tickHz: 900 };

function touchdownThump(ctx: AudioContext, dest: AudioNode, when: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(TOUCHDOWN.freqFrom, when);
  osc.frequency.exponentialRampToValueAtTime(TOUCHDOWN.freqTo, when + TOUCHDOWN.dur);
  const g = gainEnv(ctx, dest, when, 0.005, TOUCHDOWN.dur, 0.6);
  osc.connect(g);
  osc.start(when);
  osc.stop(when + TOUCHDOWN.dur + 0.02);

  const tick = ctx.createBufferSource();
  tick.buffer = noiseBuffer(ctx, 0.05, "white");
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = TOUCHDOWN.tickHz;
  const tg = gainEnv(ctx, dest, when, 0.002, 0.03, 0.2);
  tick.connect(bp);
  bp.connect(tg);
  tick.start(when);
  tick.stop(when + 0.05);
}

export function touchdownSoft(ctx: AudioContext, dest: AudioNode, when: number): void {
  touchdownThump(ctx, dest, when);
}

export const TOUCHDOWN_HARD_NOISE = { dur: 0.2, driveGain: 8 };

export function touchdownHard(ctx: AudioContext, dest: AudioNode, when: number): void {
  touchdownThump(ctx, dest, when);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, TOUCHDOWN_HARD_NOISE.dur + 0.05, "white");
  const shaper = ctx.createWaveShaper();
  shaper.curve = clipCurve(TOUCHDOWN_HARD_NOISE.driveGain);
  const g = gainEnv(ctx, dest, when, 0.005, TOUCHDOWN_HARD_NOISE.dur - 0.005, 0.4);
  noise.connect(shaper);
  shaper.connect(g);
  noise.start(when);
  noise.stop(when + TOUCHDOWN_HARD_NOISE.dur + 0.05);
}

export const CRASH = { dur: 0.8, driveGain: 20, boomHz: 40, boomDur: 0.6 };

export function crash(ctx: AudioContext, dest: AudioNode, when: number): void {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, CRASH.dur + 0.1, "white");
  const shaper = ctx.createWaveShaper();
  shaper.curve = clipCurve(CRASH.driveGain);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2500;
  const g = gainEnv(ctx, dest, when, 0.01, CRASH.dur - 0.01, 0.7);
  noise.connect(shaper);
  shaper.connect(lp);
  lp.connect(g);
  noise.start(when);
  noise.stop(when + CRASH.dur + 0.1);

  const boom = ctx.createOscillator();
  boom.type = "sine";
  boom.frequency.value = CRASH.boomHz;
  const bg = gainEnv(ctx, dest, when, 0.02, CRASH.boomDur - 0.02, 0.7);
  boom.connect(bg);
  boom.start(when);
  boom.stop(when + CRASH.boomDur + 0.05);
}

// --- sunRepel ------------------------------------------------------------
export const SUN_REPEL = { thudHz: 40, thudDur: 0.25, steamDur: 0.6, steamHz: 3000 };

export function sunRepel(ctx: AudioContext, dest: AudioNode, when: number): void {
  const thud = ctx.createOscillator();
  thud.type = "sine";
  thud.frequency.value = SUN_REPEL.thudHz;
  const tg = gainEnv(ctx, dest, when, 0.005, SUN_REPEL.thudDur, 0.6);
  thud.connect(tg);
  thud.start(when);
  thud.stop(when + SUN_REPEL.thudDur + 0.05);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, SUN_REPEL.steamDur + 0.05, "white");
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = SUN_REPEL.steamHz;
  bp.Q.value = 0.6;
  const ng = gainEnv(ctx, dest, when, 0.05, SUN_REPEL.steamDur - 0.05, 0.3);
  noise.connect(bp);
  bp.connect(ng);
  noise.start(when);
  noise.stop(when + SUN_REPEL.steamDur + 0.05);
}

// --- warnHeat / warnDescent (start/stop pairs) ------------------------------
export const WARN_HEAT = { startHz: [1046, 1318] as const, stopHz: 784, dur: 0.09, gap: 0.1 };

export function warnHeatStart(ctx: AudioContext, dest: AudioNode, when: number): void {
  WARN_HEAT.startHz.forEach((f, i) => blip(ctx, dest, when + i * WARN_HEAT.gap, f, WARN_HEAT.dur, "square", 0.22));
}
export function warnHeatStop(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, WARN_HEAT.stopHz, WARN_HEAT.dur, "square", 0.18);
}

export const WARN_DESCENT = { startHz: [523, 659] as const, stopHz: 392, dur: 0.09, gap: 0.1 };

export function warnDescentStart(ctx: AudioContext, dest: AudioNode, when: number): void {
  WARN_DESCENT.startHz.forEach((f, i) =>
    blip(ctx, dest, when + i * WARN_DESCENT.gap, f, WARN_DESCENT.dur, "square", 0.2),
  );
}
export function warnDescentStop(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, WARN_DESCENT.stopHz, WARN_DESCENT.dur, "square", 0.16);
}

// --- board / disembark / jump / uiNavOpen / uiNavClose ----------------------
export const UI_BLIPS = { board: 660, disembark: 520, jump: 880, uiNavOpen: 440, uiNavClose: 392, dur: 0.06 };

export function board(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, UI_BLIPS.board, UI_BLIPS.dur, "sine", 0.3);
}
export function disembark(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, UI_BLIPS.disembark, UI_BLIPS.dur, "sine", 0.3);
}
export function jump(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, UI_BLIPS.jump, UI_BLIPS.dur, "sine", 0.3);
}
export function uiNavOpen(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, UI_BLIPS.uiNavOpen, UI_BLIPS.dur, "triangle", 0.25);
}
export function uiNavClose(ctx: AudioContext, dest: AudioNode, when: number): void {
  blip(ctx, dest, when, UI_BLIPS.uiNavClose, UI_BLIPS.dur, "triangle", 0.25);
}

// --- dispatcher --------------------------------------------------------
export interface PlayCueOpts {
  chargeDurSec?: number;
}

// Exhaustive switch over Cue — if audioCues.ts ever grows a new cue without a
// case here, this fails to compile rather than silently no-op-ing.
export function playCue(
  cue: Cue,
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  opts?: PlayCueOpts,
): void {
  switch (cue) {
    case "launchClear":
      return launchClear(ctx, dest, when);
    case "ringCapture":
      return ringCapture(ctx, dest, when);
    case "swingHoldStart":
      return swingHoldStart(ctx, dest, when);
    case "release":
      return release(ctx, dest, when);
    case "releasePerfect":
      return releasePerfect(ctx, dest, when);
    case "breakaway":
      return breakaway(ctx, dest, when);
    case "warpChargeStart":
      return warpChargeStart(ctx, dest, when, opts?.chargeDurSec);
    case "warpEngage":
      return warpEngage(ctx, dest, when);
    case "warpArrive":
      return warpArrive(ctx, dest, when);
    case "warpAbort":
      return warpAbort(ctx, dest, when);
    case "touchdownSoft":
      return touchdownSoft(ctx, dest, when);
    case "touchdownHard":
      return touchdownHard(ctx, dest, when);
    case "crash":
      return crash(ctx, dest, when);
    case "sunRepel":
      return sunRepel(ctx, dest, when);
    case "warnHeatStart":
      return warnHeatStart(ctx, dest, when);
    case "warnHeatStop":
      return warnHeatStop(ctx, dest, when);
    case "warnDescentStart":
      return warnDescentStart(ctx, dest, when);
    case "warnDescentStop":
      return warnDescentStop(ctx, dest, when);
    case "board":
      return board(ctx, dest, when);
    case "disembark":
      return disembark(ctx, dest, when);
    case "jump":
      return jump(ctx, dest, when);
    case "uiNavOpen":
      return uiNavOpen(ctx, dest, when);
    case "uiNavClose":
      return uiNavClose(ctx, dest, when);
  }
}
