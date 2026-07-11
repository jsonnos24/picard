// tests/game/feel/atmosphere.test.ts
import { describe, it, expect } from "vitest";
import {
  skyFactor,
  cloudLayerOpacity,
  birdVisibility,
  flapFrame,
  wrapAround,
  SKY_FULL_ALT,
  SKY_TOP_ALT,
  BIRD_TOP_ALT,
} from "../../../src/game/feel/atmosphere";

describe("skyFactor", () => {
  it("is fully opaque at the ground", () => {
    expect(skyFactor(0)).toBeCloseTo(1, 6);
    expect(skyFactor(SKY_FULL_ALT)).toBeCloseTo(1, 6);
  });

  it("is gone at and above the space threshold", () => {
    expect(skyFactor(SKY_TOP_ALT)).toBeCloseTo(0, 6);
    expect(skyFactor(SKY_TOP_ALT * 3)).toBeCloseTo(0, 6);
  });

  it("fades monotonically as altitude rises through the band", () => {
    expect(skyFactor(1000)).toBeLessThan(skyFactor(500));
    expect(skyFactor(2000)).toBeLessThan(skyFactor(1000));
  });

  it("stays within [0,1]", () => {
    for (const a of [-100, 0, 400, 1500, 3000, 1e6]) {
      expect(skyFactor(a)).toBeGreaterThanOrEqual(0);
      expect(skyFactor(a)).toBeLessThanOrEqual(1);
    }
  });
});

describe("cloudLayerOpacity", () => {
  it("is fully visible from below the layer (looking up from the ground)", () => {
    expect(cloudLayerOpacity(0, 300, 200)).toBeCloseTo(1, 6);
    expect(cloudLayerOpacity(300, 300, 200)).toBeCloseTo(1, 6);
  });

  it("fades over a band once you climb above the layer", () => {
    expect(cloudLayerOpacity(400, 300, 200)).toBeCloseTo(0.5, 6);
    expect(cloudLayerOpacity(500, 300, 200)).toBeCloseTo(0, 6);
    expect(cloudLayerOpacity(350, 300, 200)).toBeGreaterThan(cloudLayerOpacity(450, 300, 200));
  });

  it("never goes negative far above the layer", () => {
    expect(cloudLayerOpacity(5000, 300, 200)).toBe(0);
  });
});

describe("birdVisibility", () => {
  it("is fully visible near the ground and gone by the top", () => {
    expect(birdVisibility(0)).toBeCloseTo(1, 6);
    expect(birdVisibility(BIRD_TOP_ALT)).toBeCloseTo(0, 6);
    expect(birdVisibility(BIRD_TOP_ALT * 2)).toBeCloseTo(0, 6);
  });

  it("fades out earlier than the sky", () => {
    expect(birdVisibility(450)).toBeLessThan(skyFactor(450));
  });
});

describe("flapFrame", () => {
  it("ping-pongs 0→1→2→1 over three frames", () => {
    expect(flapFrame(0, 3)).toBe(0);
    expect(flapFrame(1, 3)).toBe(1);
    expect(flapFrame(2, 3)).toBe(2);
    expect(flapFrame(3, 3)).toBe(1);
    expect(flapFrame(4, 3)).toBe(0); // full cycle
  });

  it("stays in range for any phase, positive or negative", () => {
    for (let phase = -20; phase <= 20; phase += 0.5) {
      const f = flapFrame(phase, 3);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(2);
    }
  });

  it("handles a single-frame flock gracefully", () => {
    expect(flapFrame(7, 1)).toBe(0);
  });
});

describe("wrapAround", () => {
  it("keeps values within [-half, half)", () => {
    for (const v of [-25, -10.5, 0, 3, 9.9, 10, 40]) {
      const w = wrapAround(v, 10);
      expect(w).toBeGreaterThanOrEqual(-10);
      expect(w).toBeLessThan(10);
    }
  });

  it("leaves an in-range value unchanged", () => {
    expect(wrapAround(3, 10)).toBeCloseTo(3, 6);
  });

  it("wraps past the far edge back to the near edge", () => {
    expect(wrapAround(11, 10)).toBeCloseTo(-9, 6);
  });
});
