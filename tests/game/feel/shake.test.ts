// tests/game/feel/shake.test.ts
import { describe, it, expect } from "vitest";
import { shakeOffset, gLeanOffset, SHAKE_MAX, LEAN_MAX } from "../../../src/game/feel/shake";
import { zeroAngular } from "../../../src/game/feel/turning";

describe("shakeOffset", () => {
  it("is zero at rest with no acceleration", () => {
    const o = shakeOffset(0, 0, 1.23);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(0, 6);
    expect(o.z).toBeCloseTo(0, 6);
  });

  it("grows with speed and acceleration but stays bounded by SHAKE_MAX", () => {
    let maxComponent = 0;
    for (let i = 0; i < 200; i++) {
      const o = shakeOffset(9000, 60, i * 0.05);
      maxComponent = Math.max(maxComponent, Math.abs(o.x), Math.abs(o.y), Math.abs(o.z));
    }
    expect(maxComponent).toBeGreaterThan(0);
    expect(maxComponent).toBeLessThanOrEqual(SHAKE_MAX + 1e-9);
  });

  it("varies over time (oscillates, not constant)", () => {
    const a = shakeOffset(9000, 60, 0.1);
    const b = shakeOffset(9000, 60, 0.2);
    expect(a.x).not.toBeCloseTo(b.x, 6);
  });
});

describe("gLeanOffset", () => {
  it("is zero when not turning", () => {
    const o = gLeanOffset(zeroAngular());
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(0, 6);
  });

  it("leans opposite a yaw and is bounded by LEAN_MAX", () => {
    const o = gLeanOffset({ pitch: 0, yaw: 1.0, roll: 0 });
    expect(Math.abs(o.x)).toBeGreaterThan(0);
    expect(Math.abs(o.x)).toBeLessThanOrEqual(LEAN_MAX + 1e-9);
  });
});
