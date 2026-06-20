import { describe, it, expect } from "vitest";
import {
  createSpacecraft,
  totalMass,
  thrustAccel,
  burnFuel,
  toMotionState,
  applyMotionState,
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

describe("toMotionState / applyMotionState adapters", () => {
  it("toMotionState extracts position and velocity from a Spacecraft", () => {
    const pos = new Vec3(1, 2, 3);
    const vel = new Vec3(4, 5, 6);
    const s = createSpacecraft(pos);
    const testShip = { ...s, velocity: vel };
    const ms = toMotionState(testShip);

    expect(ms.position.x).toBe(1);
    expect(ms.position.y).toBe(2);
    expect(ms.position.z).toBe(3);
    expect(ms.velocity.x).toBe(4);
    expect(ms.velocity.y).toBe(5);
    expect(ms.velocity.z).toBe(6);
  });

  it("applyMotionState returns a new Spacecraft with updated position and velocity", () => {
    const s = createSpacecraft(new Vec3(0, 0, 0));
    const newPos = new Vec3(10, 20, 30);
    const newVel = new Vec3(1, 2, 3);
    const ms = { position: newPos, velocity: newVel };

    const updated = applyMotionState(s, ms);

    expect(updated.position.x).toBe(10);
    expect(updated.position.y).toBe(20);
    expect(updated.position.z).toBe(30);
    expect(updated.velocity.x).toBe(1);
    expect(updated.velocity.y).toBe(2);
    expect(updated.velocity.z).toBe(3);
  });

  it("applyMotionState preserves all other Spacecraft fields unchanged", () => {
    const s = createSpacecraft(new Vec3(0, 0, 0));
    const originalDryMass = s.dryMass;
    const originalFuelMass = s.fuelMass;
    const originalMaxThrust = s.maxThrust;
    const originalExhaustVelocity = s.exhaustVelocity;
    const originalOrientation = { ...s.orientation };

    const ms = { position: new Vec3(5, 5, 5), velocity: new Vec3(1, 1, 1) };
    const updated = applyMotionState(s, ms);

    expect(updated.dryMass).toBe(originalDryMass);
    expect(updated.fuelMass).toBe(originalFuelMass);
    expect(updated.maxThrust).toBe(originalMaxThrust);
    expect(updated.exhaustVelocity).toBe(originalExhaustVelocity);
    expect(updated.orientation.x).toBe(originalOrientation.x);
    expect(updated.orientation.y).toBe(originalOrientation.y);
    expect(updated.orientation.z).toBe(originalOrientation.z);
  });

  it("applyMotionState does NOT mutate the input Spacecraft", () => {
    const s = createSpacecraft(new Vec3(0, 0, 0));
    const origX = s.position.x;

    applyMotionState(s, { position: new Vec3(999, 0, 0), velocity: Vec3.zero() });

    expect(s.position.x).toBe(origX);
  });
});
