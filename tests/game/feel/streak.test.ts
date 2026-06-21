// tests/game/feel/streak.test.ts
import { describe, it, expect } from "vitest";
import {
  streakParams,
  STREAK_OPACITY_MAX,
  STREAK_LENGTH_MAX,
} from "../../../src/game/feel/streak";

describe("streakParams", () => {
  it("is invisible at rest", () => {
    expect(streakParams(0, 0).opacity).toBeCloseTo(0, 6);
    expect(streakParams(0, 0).length).toBeCloseTo(0, 6);
  });

  it("opacity and length rise with speed, bounded by their maxima", () => {
    expect(streakParams(2000, 0).opacity).toBeGreaterThan(streakParams(200, 0).opacity);
    expect(streakParams(1e9, 0).opacity).toBeLessThanOrEqual(STREAK_OPACITY_MAX + 1e-9);
    expect(streakParams(1e9, 0).length).toBeLessThanOrEqual(STREAK_LENGTH_MAX + 1e-9);
  });

  it("boost increases intensity at a given speed but stays bounded", () => {
    const plain = streakParams(1500, 0);
    const boosted = streakParams(1500, 1);
    expect(boosted.opacity).toBeGreaterThan(plain.opacity);
    expect(boosted.opacity).toBeLessThanOrEqual(STREAK_OPACITY_MAX + 1e-9);
  });
});
