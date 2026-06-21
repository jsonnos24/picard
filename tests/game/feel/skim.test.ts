// tests/game/feel/skim.test.ts
import { describe, it, expect } from "vitest";
import { skimIntensity, SKIM_ALT } from "../../../src/game/feel/skim";

describe("skimIntensity", () => {
  it("is zero when high above the surface", () => {
    expect(skimIntensity(SKIM_ALT * 5, 5000)).toBeCloseTo(0, 6);
  });

  it("is zero when slow even if low", () => {
    expect(skimIntensity(10, 0)).toBeCloseTo(0, 6);
  });

  it("is high when low and fast", () => {
    expect(skimIntensity(20, 5000)).toBeGreaterThan(0.5);
  });

  it("stays within [0,1]", () => {
    const v = skimIntensity(0, 1e9);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("increases as altitude drops at fixed speed", () => {
    expect(skimIntensity(50, 4000)).toBeGreaterThan(skimIntensity(400, 4000));
  });
});
