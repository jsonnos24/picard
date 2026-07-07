// tests/game/feel/snapshot.test.ts
import { describe, it, expect } from "vitest";
import {
  buildSnapshot,
  idleSnapshot,
  idleCues,
  SnapshotInputs,
} from "../../../src/game/feel/snapshot";

// A representative "mid-flight" input set; individual tests override just
// the fields they care about.
const base: SnapshotInputs = {
  phaseKind: "space",
  slingKind: "none",
  cruising: false,
  lsBraking: false,
  lsSeqPhase: "idle",
  tunnel: 0,
  flash: 0,
  engage: false,
  throttle: 0.5,
  speed: 1200,
  altitude: 5000,
  verticalSpeed: -1,
  inSunBubble: false,
  ringCapturedName: null,
  breakawayHold: 0,
  assistOn: false,
  navMapOpen: false,
  missionElapsed: 42,
  cues: idleCues(),
};

describe("buildSnapshot", () => {
  it("maps straight-through fields verbatim", () => {
    const s = buildSnapshot({ ...base, phaseKind: "descending", slingKind: "captured", throttle: 0.75, speed: 900 });
    expect(s.phaseKind).toBe("descending");
    expect(s.slingKind).toBe("captured");
    expect(s.throttle).toBe(0.75);
    expect(s.speed).toBe(900);
    expect(s.missionElapsed).toBe(42);
  });

  it("idleSnapshot has falsy one-shots and neutral defaults", () => {
    const s = idleSnapshot();
    expect(s.phaseKind).toBe("landed");
    expect(s.slingKind).toBe("none");
    expect(s.snapped).toBe(false);
    expect(s.engage).toBe(false);
    expect(s.touchdownKind).toBeNull();
    expect(s.crashed).toBe(false);
    expect(s.boarded).toBe(false);
    expect(s.disembarked).toBe(false);
    expect(s.jumped).toBe(false);
    expect(s.ringCapturedName).toBeNull();
    expect(s.breakaway).toBe(false);
  });

  it("one-shot cues appear in the snapshot they're set in, and clear the next frame", () => {
    const cued = buildSnapshot({ ...base, cues: { ...idleCues(), crashed: true, jumped: true } });
    expect(cued.crashed).toBe(true);
    expect(cued.jumped).toBe(true);

    // Next frame: Game clears pendingCues back to idle before building again.
    const next = buildSnapshot({ ...base, cues: idleCues() });
    expect(next.crashed).toBe(false);
    expect(next.jumped).toBe(false);
  });

  it("derives atmosphereDensity from altitude — thick at the surface, none once clear", () => {
    const surface = buildSnapshot({ ...base, altitude: 0 });
    const clear = buildSnapshot({ ...base, altitude: 100_000 });
    expect(surface.atmosphereDensity).toBeCloseTo(1, 5);
    expect(clear.atmosphereDensity).toBe(0);
    expect(surface.atmosphereDensity).toBeGreaterThan(clear.atmosphereDensity);
  });

  it("flags warnDescent only when falling fast and low", () => {
    const fastLow = buildSnapshot({ ...base, verticalSpeed: -30, altitude: 100 });
    const fastHigh = buildSnapshot({ ...base, verticalSpeed: -30, altitude: 50_000 });
    const slowLow = buildSnapshot({ ...base, verticalSpeed: -1, altitude: 100 });
    expect(fastLow.warnDescent).toBe(true);
    expect(fastHigh.warnDescent).toBe(false);
    expect(slowLow.warnDescent).toBe(false);
  });

  it("breakaway is true only while the breakaway hold is progressing", () => {
    expect(buildSnapshot({ ...base, breakawayHold: 0 }).breakaway).toBe(false);
    expect(buildSnapshot({ ...base, breakawayHold: 0.3 }).breakaway).toBe(true);
  });

  it("paused mirrors navMapOpen (the only thing that pauses the sim today)", () => {
    expect(buildSnapshot({ ...base, navMapOpen: false }).paused).toBe(false);
    expect(buildSnapshot({ ...base, navMapOpen: true }).paused).toBe(true);
  });

  it("passes ringCapturedName through untouched", () => {
    expect(buildSnapshot({ ...base, ringCapturedName: null }).ringCapturedName).toBeNull();
    expect(buildSnapshot({ ...base, ringCapturedName: "Mars" }).ringCapturedName).toBe("Mars");
  });
});
