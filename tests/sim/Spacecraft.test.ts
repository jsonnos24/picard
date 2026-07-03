import { describe, it, expect } from "vitest";
import {
  createSpacecraft,
  thrustAccel,
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
    expect(a.y).toBeCloseTo(s.maxThrust / s.mass, 6);
  });

  it("out-thrusts toy Earth's 10 m/s² with punchy arcade margin", () => {
    const s = createSpacecraft(Vec3.zero());
    s.throttle = 1;
    expect(thrustAccel(s).length()).toBeGreaterThan(25);
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
    const ms = { position: new Vec3(10, 20, 30), velocity: new Vec3(1, 2, 3) };

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
    const originalMass = s.mass;
    const originalMaxThrust = s.maxThrust;
    const originalOrientation = { ...s.orientation };

    const ms = { position: new Vec3(5, 5, 5), velocity: new Vec3(1, 1, 1) };
    const updated = applyMotionState(s, ms);

    expect(updated.mass).toBe(originalMass);
    expect(updated.maxThrust).toBe(originalMaxThrust);
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
