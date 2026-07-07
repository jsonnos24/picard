// tests/game/feel/audioLevels.test.ts
import { describe, it, expect } from "vitest";
import { audioLevels, SMOOTHING, WIND_SPEED_REF } from "../../../src/game/feel/audioLevels";
import { idleSnapshot } from "../../../src/game/feel/snapshot";
import type { FrameSnapshot } from "../../../src/game/feel/snapshot";

function mk(overrides: Partial<FrameSnapshot>): FrameSnapshot {
  return { ...idleSnapshot(), ...overrides };
}

describe("audioLevels", () => {
  it("engine is 0 at zero throttle and rises with throttle", () => {
    const zero = audioLevels(mk({ throttle: 0 }));
    const half = audioLevels(mk({ throttle: 0.5 }));
    const full = audioLevels(mk({ throttle: 1 }));
    expect(zero.engine).toBe(0);
    expect(half.engine).toBeGreaterThan(zero.engine);
    expect(full.engine).toBeGreaterThan(half.engine);
    expect(full.engine).toBeCloseTo(Math.pow(1, 0.7), 6);
  });

  it("enginePitch is 1 + 0.4*throttle", () => {
    const l = audioLevels(mk({ throttle: 0.5 }));
    expect(l.enginePitch).toBeCloseTo(1.2, 6);
  });

  it("engine and levels are silent when paused, regardless of throttle/speed", () => {
    const l = audioLevels(
      mk({ paused: true, throttle: 1, speed: 500, atmosphereDensity: 1, tunnel: 1, flash: 1 }),
    );
    expect(l.engine).toBe(0);
    expect(l.wind).toBe(0);
    expect(l.warpBed).toBe(0);
    expect(l.rumble).toBe(0);
    expect(l.danger).toBe(0);
  });

  it("engine is silent when navMapOpen even if paused weren't set", () => {
    const l = audioLevels(mk({ navMapOpen: true, paused: false, throttle: 1 }));
    expect(l.engine).toBe(0);
  });

  it("wind is 0 in vacuum regardless of speed", () => {
    const l = audioLevels(mk({ atmosphereDensity: 0, speed: 1000 }));
    expect(l.wind).toBe(0);
  });

  it("wind scales with atmosphereDensity * speed and clamps to 1", () => {
    const light = audioLevels(mk({ atmosphereDensity: 0.5, speed: 100 }));
    const heavy = audioLevels(mk({ atmosphereDensity: 1, speed: WIND_SPEED_REF * 2 }));
    expect(light.wind).toBeGreaterThan(0);
    expect(light.wind).toBeLessThan(1);
    expect(heavy.wind).toBe(1);
  });

  it("a typical Earth in-atmosphere descent (100-300 m/s, near-surface density) lands wind in a usable 0.3-0.9 band", () => {
    const slow = audioLevels(mk({ atmosphereDensity: 1, speed: 100 }));
    const fast = audioLevels(mk({ atmosphereDensity: 1, speed: 300 }));
    expect(slow.wind).toBeGreaterThanOrEqual(0.3);
    expect(fast.wind).toBeLessThanOrEqual(1);
    expect(fast.wind).toBeGreaterThan(slow.wind);
  });

  it("windCutoff rises monotonically with speed", () => {
    const slow = audioLevels(mk({ speed: 50 }));
    const fast = audioLevels(mk({ speed: 500 }));
    expect(fast.windCutoff).toBeGreaterThan(slow.windCutoff);
  });

  it("warpBed mirrors tunnel directly", () => {
    expect(audioLevels(mk({ tunnel: 0.42 })).warpBed).toBeCloseTo(0.42, 6);
    expect(audioLevels(mk({ tunnel: 1 })).warpBed).toBeCloseTo(1, 6);
  });

  it("rumble is 0.5 baseline while sling-captured with no flash", () => {
    const l = audioLevels(mk({ slingKind: "captured", flash: 0 }));
    expect(l.rumble).toBeCloseTo(0.5, 6);
  });

  it("rumble adds flash*0.5 on top and clamps at 1", () => {
    const some = audioLevels(mk({ slingKind: "none", flash: 0.4 }));
    const capped = audioLevels(mk({ slingKind: "captured", flash: 1 }));
    expect(some.rumble).toBeCloseTo(0.2, 6);
    expect(capped.rumble).toBe(1);
  });

  it("danger is 1 while inSunBubble, else 0", () => {
    expect(audioLevels(mk({ inSunBubble: true })).danger).toBe(1);
    expect(audioLevels(mk({ inSunBubble: false, warnDescent: false })).danger).toBe(0);
  });

  it("danger is 1 while warnDescent", () => {
    expect(audioLevels(mk({ warnDescent: true })).danger).toBe(1);
  });

  it("SMOOTHING carries the documented attack/release constants per layer", () => {
    expect(SMOOTHING.engine).toEqual({ attack: 0.1, release: 0.3 });
    expect(SMOOTHING.wind).toEqual({ attack: 0.5, release: 1.0 });
    expect(SMOOTHING.warpBed).toEqual({ attack: 0.2, release: 0.8 });
    expect(SMOOTHING.rumble).toEqual({ attack: 0.05, release: 0.4 });
    expect(SMOOTHING.danger).toEqual({ attack: 0.05, release: 0.2 });
  });
});
