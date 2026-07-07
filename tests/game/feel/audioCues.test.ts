// tests/game/feel/audioCues.test.ts
import { describe, it, expect } from "vitest";
import { audioCues } from "../../../src/game/feel/audioCues";
import { idleSnapshot } from "../../../src/game/feel/snapshot";
import type { FrameSnapshot } from "../../../src/game/feel/snapshot";

// Build a snapshot from the resting idle snapshot plus overrides — keeps
// each test focused on just the fields it's exercising.
function mk(overrides: Partial<FrameSnapshot>): FrameSnapshot {
  return { ...idleSnapshot(), ...overrides };
}

describe("audioCues", () => {
  it("prev === null (first frame): no cues at all, however busy cur looks", () => {
    const cur = mk({ crashed: true, jumped: true, touchdownKind: "hard", boarded: true });
    expect(audioCues(null, cur)).toEqual([]);
  });

  it("launchClear: phaseKind landed -> launching", () => {
    const prev = mk({ phaseKind: "landed" });
    const cur = mk({ phaseKind: "launching" });
    expect(audioCues(prev, cur)).toContain("launchClear");
  });

  it("ringCapture: ringCapturedName null -> non-null", () => {
    const prev = mk({ ringCapturedName: null });
    const cur = mk({ ringCapturedName: "Mars" });
    expect(audioCues(prev, cur)).toContain("ringCapture");
  });

  it("swingHoldStart: slingKind entering captured", () => {
    const prev = mk({ slingKind: "none" });
    const cur = mk({ slingKind: "captured" });
    expect(audioCues(prev, cur)).toContain("swingHoldStart");
  });

  it("release: slingKind captured -> released, not snapped", () => {
    const prev = mk({ slingKind: "captured" });
    const cur = mk({ slingKind: "released", snapped: false });
    const cues = audioCues(prev, cur);
    expect(cues).toContain("release");
    expect(cues).not.toContain("releasePerfect");
  });

  it("releasePerfect: slingKind captured -> released with snapped true, and suppresses plain release", () => {
    const prev = mk({ slingKind: "captured" });
    const cur = mk({ slingKind: "released", snapped: true });
    const cues = audioCues(prev, cur);
    expect(cues).toContain("releasePerfect");
    expect(cues).not.toContain("release");
  });

  it("breakaway: breakaway false -> true", () => {
    const prev = mk({ breakaway: false });
    const cur = mk({ breakaway: true });
    expect(audioCues(prev, cur)).toContain("breakaway");
  });

  it("warpChargeStart: lsSeqPhase entering charge", () => {
    const prev = mk({ lsSeqPhase: "idle" });
    const cur = mk({ lsSeqPhase: "charge" });
    expect(audioCues(prev, cur)).toContain("warpChargeStart");
  });

  it("warpEngage: engage one-shot", () => {
    const prev = mk({ lsSeqPhase: "charge" });
    const cur = mk({ lsSeqPhase: "burst", engage: true });
    expect(audioCues(prev, cur)).toContain("warpEngage");
  });

  it("warpArrive: cruising true -> false while lsSeqPhase reads settle (natural wind-down)", () => {
    const prev = mk({ cruising: true, lsSeqPhase: "cruise" });
    const cur = mk({ cruising: false, lsSeqPhase: "settle" });
    const cues = audioCues(prev, cur);
    expect(cues).toContain("warpArrive");
    expect(cues).not.toContain("warpAbort");
  });

  it("warpArrive: cruising true -> false the same frame ringCapturedName becomes non-null", () => {
    const prev = mk({ cruising: true, lsSeqPhase: "cruise", ringCapturedName: null });
    const cur = mk({ cruising: false, lsSeqPhase: "cruise", ringCapturedName: "Mars" });
    const cues = audioCues(prev, cur);
    expect(cues).toContain("warpArrive");
    expect(cues).not.toContain("warpAbort");
  });

  it("warpAbort: cruising true -> false without settling and without a fresh capture", () => {
    const prev = mk({ cruising: true, lsSeqPhase: "cruise", ringCapturedName: null });
    const cur = mk({ cruising: false, lsSeqPhase: "cruise", ringCapturedName: null });
    const cues = audioCues(prev, cur);
    expect(cues).toContain("warpAbort");
    expect(cues).not.toContain("warpArrive");
  });

  it("touchdownSoft: touchdownKind one-shot", () => {
    const prev = mk({});
    const cur = mk({ touchdownKind: "soft" });
    expect(audioCues(prev, cur)).toContain("touchdownSoft");
  });

  it("touchdownHard: touchdownKind one-shot", () => {
    const prev = mk({});
    const cur = mk({ touchdownKind: "hard" });
    expect(audioCues(prev, cur)).toContain("touchdownHard");
  });

  it("crash: crashed one-shot", () => {
    const prev = mk({});
    const cur = mk({ crashed: true });
    expect(audioCues(prev, cur)).toContain("crash");
  });

  it("sunRepel and warnHeatStart both fire on entering the sun bubble", () => {
    const prev = mk({ inSunBubble: false });
    const cur = mk({ inSunBubble: true });
    const cues = audioCues(prev, cur);
    expect(cues).toContain("sunRepel");
    expect(cues).toContain("warnHeatStart");
  });

  it("warnHeatStop: inSunBubble true -> false", () => {
    const prev = mk({ inSunBubble: true });
    const cur = mk({ inSunBubble: false });
    const cues = audioCues(prev, cur);
    expect(cues).toContain("warnHeatStop");
    expect(cues).not.toContain("sunRepel");
    expect(cues).not.toContain("warnHeatStart");
  });

  it("warnDescentStart: warnDescent false -> true", () => {
    const prev = mk({ warnDescent: false });
    const cur = mk({ warnDescent: true });
    expect(audioCues(prev, cur)).toContain("warnDescentStart");
  });

  it("warnDescentStop: warnDescent true -> false", () => {
    const prev = mk({ warnDescent: true });
    const cur = mk({ warnDescent: false });
    expect(audioCues(prev, cur)).toContain("warnDescentStop");
  });

  it("board: boarded one-shot", () => {
    const prev = mk({});
    const cur = mk({ boarded: true });
    expect(audioCues(prev, cur)).toContain("board");
  });

  it("disembark: disembarked one-shot", () => {
    const prev = mk({});
    const cur = mk({ disembarked: true });
    expect(audioCues(prev, cur)).toContain("disembark");
  });

  it("jump: jumped one-shot", () => {
    const prev = mk({});
    const cur = mk({ jumped: true });
    expect(audioCues(prev, cur)).toContain("jump");
  });

  it("uiNavOpen: navMapOpen false -> true", () => {
    const prev = mk({ navMapOpen: false });
    const cur = mk({ navMapOpen: true });
    expect(audioCues(prev, cur)).toContain("uiNavOpen");
  });

  it("uiNavClose: navMapOpen true -> false", () => {
    const prev = mk({ navMapOpen: true });
    const cur = mk({ navMapOpen: false });
    expect(audioCues(prev, cur)).toContain("uiNavClose");
  });

  it("no-repeat-while-held: a level condition holding steady across many frames fires its cue only once", () => {
    const snaps: FrameSnapshot[] = [
      mk({ inSunBubble: false }),
      mk({ inSunBubble: true }),
      mk({ inSunBubble: true }),
      mk({ inSunBubble: true }),
    ];
    let heatStarts = 0;
    for (let i = 1; i < snaps.length; i++) {
      const cues = audioCues(snaps[i - 1], snaps[i]);
      heatStarts += cues.filter((c) => c === "warnHeatStart").length;
    }
    expect(heatStarts).toBe(1);
  });

  it("no-repeat-while-held: slingKind staying captured across frames does not refire swingHoldStart", () => {
    const snaps: FrameSnapshot[] = [
      mk({ slingKind: "none" }),
      mk({ slingKind: "captured" }),
      mk({ slingKind: "captured" }),
      mk({ slingKind: "captured" }),
    ];
    let starts = 0;
    for (let i = 1; i < snaps.length; i++) {
      starts += audioCues(snaps[i - 1], snaps[i]).filter((c) => c === "swingHoldStart").length;
    }
    expect(starts).toBe(1);
  });
});
