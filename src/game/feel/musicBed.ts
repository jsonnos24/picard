// src/game/feel/musicBed.ts
// A tiny generative ambient sequencer. Pure and deterministic: given the same
// seed and the same sequence of (dtBeats, mood) calls, it always produces the
// same NoteEvents — a WebAudio director schedules them, this module never
// touches WebAudio/DOM/Three directly.
import { mulberry32Step } from "./prng";
import type { FrameSnapshot } from "./snapshot";

export type Mood = "calm" | "drift" | "wonder" | "tense";

// Priority: tense (danger) beats everything; cruising (wonder) beats the
// plain landed/space split; anything else falls back to drift.
export function moodFromSnapshot(s: FrameSnapshot): Mood {
  if (s.inSunBubble || s.warnDescent) return "tense";
  if (s.cruising) return "wonder";
  if (s.phaseKind === "landed" || s.phaseKind === "onFoot") return "calm";
  return "drift"; // space, descending (non-cruising), launching
}

export type Voice = "pad" | "lead" | "bass";

export interface NoteEvent {
  freq: number;
  dur: number; // beats
  gain: number; // 0..1
  voice: Voice;
}

// MusicState is plain data (no closures) so it can be logged, diffed, or
// eventually persisted; `rngState` is a mulberry32 32-bit state word.
export interface MusicState {
  rngState: number;
  beat: number; // total elapsed beats, monotonically increasing
  chordIndex: number; // advances once per pad-chord firing (every 8 beats)
}

export function initMusicState(seed: number): MusicState {
  return { rngState: seed >>> 0, beat: 0, chordIndex: 0 };
}

// --- Pitch table -----------------------------------------------------------
// Equal temperament, A4 = 440Hz. `midi()` uses scientific pitch notation
// (C4 = MIDI 60) so chord tables below read like sheet music.
const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(letter: string, octave: number, accidental = 0): number {
  const midiNote = 12 * (octave + 1) + LETTER_SEMITONE[letter] + accidental;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

const N = {
  C2: freq("C", 2),
  D2: freq("D", 2),
  F2: freq("F", 2),
  A2: freq("A", 2),
  Bb2: freq("B", 2, -1),

  C3: freq("C", 3),
  D3: freq("D", 3),
  E3: freq("E", 3),
  F3: freq("F", 3),
  G3: freq("G", 3),
  A3: freq("A", 3),

  C4: freq("C", 4),
  D4: freq("D", 4),
  E4: freq("E", 4),
  G4: freq("G", 4),
  A4: freq("A", 4),
  B4: freq("B", 4),

  C5: freq("C", 5),
  D5: freq("D", 5),
  E5: freq("E", 5),
  G5: freq("G", 5),
  A5: freq("A", 5),
};

const PENTATONIC = [N.C5, N.D5, N.E5, N.G5, N.A5];

// Pad chord voicings per mood; wonder and drift cycle two-or-three voicings
// by chordIndex so consecutive pad chords aren't identical.
function padChord(mood: Mood, chordIndex: number): number[] {
  switch (mood) {
    case "calm":
      return [N.C3, N.E3, N.G3, N.D4]; // Cmaj9-ish
    case "drift":
      return chordIndex % 2 === 0
        ? [N.A3, N.C4, N.E4, N.B4] // Am add9
        : [N.F3, N.A3, N.C4, N.E4]; // Fmaj7
    case "wonder": {
      const voicings = [
        [N.C4, N.G4], // C open fifth
        [N.D4, N.A4], // D open fifth
        [N.G3, N.D3], // G open fifth (lower octave for contrast)
      ];
      return voicings[chordIndex % voicings.length];
    }
    case "tense":
      return [N.D3, N.F3, N.A3, N.Bb2]; // Dm/Bb low cluster
  }
}

function bassRoot(mood: Mood, chordIndex: number): number {
  switch (mood) {
    case "calm":
      return N.C2;
    case "drift":
      return chordIndex % 2 === 0 ? N.A2 : N.F2;
    case "wonder": {
      const roots = [N.C3, N.D3, N.G3];
      return roots[chordIndex % roots.length];
    }
    case "tense":
      return N.D2;
  }
}

const LEAD_PROB: Record<Mood, number> = { calm: 0.05, drift: 0.1, wonder: 0.3, tense: 0 };

const PAD_GAIN = 0.4; // <= 0.5
const PAD_DUR = 6; // beats, within 2-8
const BASS_GAIN = 0.35; // <= 0.4
const BASS_DUR = 3; // beats
const LEAD_GAIN = 0.3; // <= 0.35
const LEAD_DUR = 1; // beats, within 0.5-2

export function musicStep(
  state: MusicState,
  dtBeats: number,
  mood: Mood,
): { state: MusicState; events: NoteEvent[] } {
  const beatBefore = state.beat;
  const beatAfter = beatBefore + dtBeats;
  const events: NoteEvent[] = [];

  // Boundary-crossing detection, inclusive of the very first step from a
  // fresh MusicState (beatBefore === 0) so the bed starts sounding
  // immediately instead of waiting out a silent first bar.
  const crossedPad = beatBefore === 0 || Math.floor(beatBefore / 8) !== Math.floor(beatAfter / 8);
  const crossedBass = beatBefore === 0 || Math.floor(beatBefore / 4) !== Math.floor(beatAfter / 4);

  let chordIndex = state.chordIndex;
  if (crossedPad) {
    chordIndex = state.chordIndex + (beatBefore === 0 ? 0 : 1);
    for (const f of padChord(mood, chordIndex)) {
      events.push({ freq: f, dur: PAD_DUR, gain: PAD_GAIN, voice: "pad" });
    }
  }
  if (crossedBass) {
    events.push({ freq: bassRoot(mood, chordIndex), dur: BASS_DUR, gain: BASS_GAIN, voice: "bass" });
  }

  // One deterministic gate roll per step for the lead voice, scaled by the
  // step's beat span so the roll rate stays ~probability-per-beat regardless
  // of how finely the caller subdivides beats.
  let rngState = state.rngState;
  const gate = mulberry32Step(rngState);
  rngState = gate.next;
  const leadP = LEAD_PROB[mood] * dtBeats;
  if (leadP > 0 && gate.value < leadP) {
    const pick = mulberry32Step(rngState);
    rngState = pick.next;
    const note = PENTATONIC[Math.floor(pick.value * PENTATONIC.length) % PENTATONIC.length];
    events.push({ freq: note, dur: LEAD_DUR, gain: LEAD_GAIN, voice: "lead" });
  }

  return { state: { rngState, beat: beatAfter, chordIndex }, events };
}
