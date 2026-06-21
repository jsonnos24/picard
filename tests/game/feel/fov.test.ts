// tests/game/feel/fov.test.ts
import { describe, it, expect } from "vitest";
import { fovForSpeed, FOV_BASE, FOV_MAX } from "../../../src/game/feel/fov";

describe("fovForSpeed", () => {
  it("is the base FOV at rest", () => {
    expect(fovForSpeed(0)).toBeCloseTo(FOV_BASE, 6);
  });

  it("widens monotonically with speed", () => {
    expect(fovForSpeed(2000)).toBeGreaterThan(fovForSpeed(500));
    expect(fovForSpeed(500)).toBeGreaterThan(fovForSpeed(0));
  });

  it("never exceeds FOV_MAX", () => {
    expect(fovForSpeed(1e9)).toBeLessThanOrEqual(FOV_MAX);
    expect(fovForSpeed(1e9)).toBeGreaterThan(FOV_MAX - 1); // asymptotes close to max
  });

  it("is finite and base for tiny speeds", () => {
    expect(fovForSpeed(1)).toBeCloseTo(FOV_BASE, 1);
  });
});
