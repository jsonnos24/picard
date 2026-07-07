// src/audio/music.ts
// Generative ambient music: advances musicBed.ts's pure beat clock each
// frame and schedules the NoteEvents it returns onto three voices (pad,
// lead, bass) through a shared "space" send (short feedback delay). No
// per-frame node churn beyond the notes actually fired this frame — most
// frames fire zero or one.
import { musicStep, initMusicState, MusicState, Mood, NoteEvent, Voice } from "../game/feel/musicBed";

const BPM = 72;
const BEATS_PER_SEC = BPM / 60;

export interface Music {
  step(dt: number, mood: Mood): void;
}

// Shared feedback delay ("space"): ~0.35s, feedback 0.3, lowpassed so
// repeats don't build up harshness. Voices send a fraction of their signal
// into `input`; the wet tail feeds back into itself before reaching dest.
function createSpaceSend(ctx: AudioContext, dest: AudioNode): GainNode {
  const input = ctx.createGain();
  input.gain.value = 1;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.35;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2500;
  input.connect(delay);
  delay.connect(lp);
  lp.connect(feedback);
  feedback.connect(delay);
  lp.connect(dest);
  return input;
}

const VOICE_SHAPE: Record<Voice, { type: OscillatorType; attack: number; release: number }> = {
  pad: { type: "triangle", attack: 1.5, release: 3 },
  lead: { type: "sine", attack: 0.05, release: 0.4 },
  bass: { type: "sine", attack: 0.05, release: 0.5 },
};

function playVoice(ctx: AudioContext, dryDest: AudioNode, wetDest: AudioNode, ev: NoteEvent, when: number): void {
  const shape = VOICE_SHAPE[ev.voice];
  const freq = ev.voice === "bass" ? ev.freq / 2 : ev.freq;
  const durSec = ev.dur / BEATS_PER_SEC;
  const holdEnd = when + Math.max(durSec, shape.attack);
  const releaseEnd = holdEnd + shape.release;

  const osc = ctx.createOscillator();
  osc.type = shape.type;
  osc.frequency.setValueAtTime(freq, when);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(ev.gain, when + shape.attack);
  g.gain.setValueAtTime(ev.gain, holdEnd);
  g.gain.linearRampToValueAtTime(0.0001, releaseEnd);
  osc.connect(g);
  g.connect(dryDest);

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.35;
  g.connect(wetGain);
  wetGain.connect(wetDest);

  if (ev.voice === "lead") {
    // Gentle 5 Hz vibrato via an LFO modulating the oscillator's frequency.
    const vibrato = ctx.createOscillator();
    vibrato.type = "sine";
    vibrato.frequency.value = 5;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = freq * 0.01;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(when);
    vibrato.stop(releaseEnd + 0.1);
  }

  osc.start(when);
  osc.stop(releaseEnd + 0.1);
}

export function createMusic(ctx: AudioContext, dest: AudioNode): Music {
  let state: MusicState = initMusicState((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  const spaceSend = createSpaceSend(ctx, dest);

  return {
    step(dt, mood) {
      if (dt <= 0) return;
      const dtBeats = dt * BEATS_PER_SEC;
      const r = musicStep(state, dtBeats, mood);
      state = r.state;
      if (r.events.length === 0) return;
      const when = ctx.currentTime;
      for (const ev of r.events) playVoice(ctx, dest, spaceSend, ev, when);
    },
  };
}
