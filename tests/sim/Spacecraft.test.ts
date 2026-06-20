import { describe, it, expect } from "vitest";
import {
  createSpacecraft,
  totalMass,
  thrustAccel,
  burnFuel,
} from "../../src/sim/Spacecraft";
import { Vec3 } from "../../src/sim/Vec3";

describe("Spacecraft", () => {
  it("produces zero thrust at zero throttle", () => {
    const s = createSpacecraft(Vec3.zero());
    s.throttle = 0;
    expect(thrustAccel(s).length()).toBe(0);
  });

  it("produces thrust along orientation scaled by throttle/mass", () => {
    const s = createSpacecraft(Vec3.zero());
    s.orientation = new Vec3(0, 1, 0);
    s.throttle = 1;
    const a = thrustAccel(s);
    expect(a.x).toBe(0);
    expect(a.z).toBe(0);
    expect(a.y).toBeCloseTo(s.maxThrust / totalMass(s), 6);
  });

  it("burns fuel proportional to throttle and time", () => {
    const s = createSpacecraft(Vec3.zero());
    s.throttle = 1;
    const before = s.fuelMass;
    const after = burnFuel(s, 1);
    const mdot = (s.throttle * s.maxThrust) / s.exhaustVelocity;
    expect(after.fuelMass).toBeCloseTo(before - mdot, 3);
  });

  it("never burns below zero fuel and makes thrust zero when empty", () => {
    let s = createSpacecraft(Vec3.zero());
    s.throttle = 1;
    s.fuelMass = 0;
    s = burnFuel(s, 10);
    expect(s.fuelMass).toBe(0);
    expect(thrustAccel(s).length()).toBe(0);
  });

  it("burnFuel does not mutate the input", () => {
    const s = createSpacecraft(Vec3.zero());
    s.throttle = 1;
    const fuelBefore = s.fuelMass;
    burnFuel(s, 1);
    expect(s.fuelMass).toBe(fuelBefore);
  });
});
