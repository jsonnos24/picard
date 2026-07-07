// tests/game/feel/shake.test.ts
import { describe, it, expect } from "vitest";
import {
  shakeOffset,
  gLeanOffset,
  SHAKE_MAX,
  LEAN_MAX,
  chaseShake,
  CHASE_SHAKE_MAX,
  idleImpulse,
  addImpulse,
  decayImpulse,
  TOUCHDOWN_IMPULSE_TAU,
} from "../../../src/game/feel/shake";
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

describe("chaseShake", () => {
  const zero = { throttle: 0, atmosphereDensity: 0, speed: 0, flash: 0, touchdownImpulse: 0 };

  function maxComponent(inputs: typeof zero, samples = 100): number {
    let max = 0;
    for (let i = 0; i < samples; i++) {
      const o = chaseShake(inputs, i * 0.05);
      max = Math.max(max, Math.abs(o.x), Math.abs(o.y), Math.abs(o.z));
    }
    return max;
  }

  it("is zero with zero inputs", () => {
    const o = chaseShake(zero, 1.0);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(0, 6);
    expect(o.z).toBeCloseTo(0, 6);
  });

  it("stays zero below the throttle ramp threshold (0.7)", () => {
    expect(maxComponent({ ...zero, throttle: 0.5 })).toBeCloseTo(0, 6);
  });

  it("throttle above 0.7 contributes shake", () => {
    expect(maxComponent({ ...zero, throttle: 1 })).toBeGreaterThan(0);
  });

  it("atmosphere entry contributes shake (Earth descent ~200 m/s ~= 0.6 of cap)", () => {
    const max = maxComponent({ ...zero, atmosphereDensity: 1, speed: 200 });
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(CHASE_SHAKE_MAX); // ~0.6 of cap, not saturated
  });

  it("warp flash contributes shake", () => {
    expect(maxComponent({ ...zero, flash: 1 })).toBeGreaterThan(0);
  });

  it("touchdown impulse contributes shake", () => {
    expect(maxComponent({ ...zero, touchdownImpulse: 1 })).toBeGreaterThan(0);
  });

  it("caps the combined amplitude at CHASE_SHAKE_MAX (0.35x cockpit SHAKE_MAX)", () => {
    expect(CHASE_SHAKE_MAX).toBeCloseTo(0.35 * SHAKE_MAX, 9);
    const max = maxComponent(
      { throttle: 1, atmosphereDensity: 1, speed: 9000, flash: 1, touchdownImpulse: 1 },
      200,
    );
    expect(max).toBeLessThanOrEqual(CHASE_SHAKE_MAX + 1e-9);
  });
});

describe("touchdown impulse decay", () => {
  it("idle state starts at zero", () => {
    expect(idleImpulse().value).toBe(0);
  });

  it("addImpulse raises the value, clamped to 1", () => {
    const s = addImpulse(idleImpulse(), 0.7);
    expect(s.value).toBeCloseTo(0.7, 6);
    const clamped = addImpulse(s, 0.7);
    expect(clamped.value).toBe(1);
  });

  it("decays toward zero with tau ~0.4s", () => {
    const s0 = addImpulse(idleImpulse(), 1);
    const s1 = decayImpulse(s0, TOUCHDOWN_IMPULSE_TAU);
    expect(s1.value).toBeCloseTo(1 / Math.E, 3);
    expect(s1.value).toBeLessThan(s0.value);
  });

  it("never goes negative and stays at zero from an idle state", () => {
    const s = decayImpulse(idleImpulse(), 1);
    expect(s.value).toBe(0);
  });
});
