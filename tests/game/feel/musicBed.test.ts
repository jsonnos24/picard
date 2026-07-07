// tests/game/feel/musicBed.test.ts
import { describe, it, expect } from "vitest";
import {
  moodFromSnapshot,
  initMusicState,
  musicStep,
  type MusicState,
  type NoteEvent,
} from "../../../src/game/feel/musicBed";
import { idleSnapshot } from "../../../src/game/feel/snapshot";
import type { FrameSnapshot } from "../../../src/game/feel/snapshot";

function mk(overrides: Partial<FrameSnapshot>): FrameSnapshot {
  return { ...idleSnapshot(), ...overrides };
}

function run(seed: number, steps: number, dtBeats: number, mood: "calm" | "drift" | "wonder" | "tense") {
  let state = initMusicState(seed);
  const events: NoteEvent[] = [];
  for (let i = 0; i < steps; i++) {
    const r = musicStep(state, dtBeats, mood);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

describe("moodFromSnapshot", () => {
  it("landed and onFoot map to calm", () => {
    expect(moodFromSnapshot(mk({ phaseKind: "landed" }))).toBe("calm");
    expect(moodFromSnapshot(mk({ phaseKind: "onFoot" }))).toBe("calm");
  });

  it("space and descending (non-cruising) map to drift", () => {
    expect(moodFromSnapshot(mk({ phaseKind: "space", cruising: false }))).toBe("drift");
    expect(moodFromSnapshot(mk({ phaseKind: "descending", cruising: false }))).toBe("drift");
  });

  it("cruising maps to wonder", () => {
    expect(moodFromSnapshot(mk({ phaseKind: "space", cruising: true }))).toBe("wonder");
  });

  it("danger (inSunBubble or warnDescent) maps to tense, winning over everything else", () => {
    expect(moodFromSnapshot(mk({ inSunBubble: true, phaseKind: "landed" }))).toBe("tense");
    expect(moodFromSnapshot(mk({ warnDescent: true, cruising: true }))).toBe("tense");
  });

  it("wonder wins over drift when both cruising and non-landed phase apply", () => {
    expect(moodFromSnapshot(mk({ phaseKind: "descending", cruising: true }))).toBe("wonder");
  });
});

describe("musicStep determinism", () => {
  it("same seed + same call sequence produces the same events", () => {
    const a = run(42, 200, 0.5, "wonder");
    const b = run(42, 200, 0.5, "wonder");
    expect(a.events).toEqual(b.events);
  });

  it("different seeds diverge in their lead-note picks over time", () => {
    const a = run(1, 200, 0.5, "wonder");
    const b = run(2, 200, 0.5, "wonder");
    expect(a.events).not.toEqual(b.events);
  });
});

describe("musicStep note shape", () => {
  it("emits only known voices with freq/dur/gain within documented bounds, across all moods", () => {
    const moods: Array<"calm" | "drift" | "wonder" | "tense"> = ["calm", "drift", "wonder", "tense"];
    for (const mood of moods) {
      const { events } = run(7, 400, 0.25, mood);
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(["pad", "lead", "bass"]).toContain(e.voice);
        expect(e.freq).toBeGreaterThan(0);
        if (e.voice === "pad") {
          expect(e.gain).toBeLessThanOrEqual(0.5);
          expect(e.dur).toBeGreaterThanOrEqual(2);
          expect(e.dur).toBeLessThanOrEqual(8);
        } else if (e.voice === "lead") {
          expect(e.gain).toBeLessThanOrEqual(0.35);
          expect(e.dur).toBeGreaterThanOrEqual(0.5);
          expect(e.dur).toBeLessThanOrEqual(2);
        } else if (e.voice === "bass") {
          expect(e.gain).toBeLessThanOrEqual(0.4);
        }
      }
    }
  });

  it("tense mood never emits lead notes (probability 0)", () => {
    const { events } = run(99, 2000, 0.25, "tense");
    expect(events.some((e) => e.voice === "lead")).toBe(false);
  });

  it("wonder mood emits lead notes over a long enough run (probability 0.3/beat)", () => {
    const { events } = run(99, 2000, 0.25, "wonder");
    expect(events.some((e) => e.voice === "lead")).toBe(true);
  });
});

describe("musicStep chord cadence", () => {
  it("emits a pad chord roughly every 8 beats and a bass root roughly every 4 beats", () => {
    const { events } = run(5, 64, 1, "calm"); // 64 beats total, 1 beat per step
    const pads = events.filter((e) => e.voice === "pad").length;
    const basses = events.filter((e) => e.voice === "bass").length;
    // Pad chords have 4 notes per firing (see brief's chord pools).
    const padFirings = pads / 4;
    expect(padFirings).toBeGreaterThanOrEqual(7);
    expect(padFirings).toBeLessThanOrEqual(9);
    expect(basses).toBeGreaterThanOrEqual(15);
    expect(basses).toBeLessThanOrEqual(17);
    // Bass fires roughly twice as often as pad.
    expect(basses).toBeGreaterThan(padFirings);
  });
});

describe("MusicState", () => {
  it("initMusicState is plain, inspectable data (no closures) — beat 0, chordIndex 0", () => {
    const s: MusicState = initMusicState(123);
    expect(s.beat).toBe(0);
    expect(s.chordIndex).toBe(0);
    expect(typeof s.rngState).toBe("number");
  });
});
