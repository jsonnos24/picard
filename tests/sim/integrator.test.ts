import { describe, it, expect } from "vitest";
import { verletStep, MotionState } from "../../src/sim/integrator";
import { Vec3 } from "../../src/sim/Vec3";
import { gravityAccel } from "../../src/sim/gravity";
import { Body } from "../../src/sim/Body";
import { G } from "../../src/sim/constants";

// A single heavy point mass at origin for a clean analytic orbit.
const center: Body = {
  name: "C",
  mass: 5.972e24,
  radius: 1,
  position: Vec3.zero(),
  atmosphere: null,
};

describe("verletStep", () => {
  it("keeps a circular orbit's radius stable over one period", () => {
    const r = 7.0e6;
    const speed = Math.sqrt((G * center.mass) / r); // circular velocity
    let state: MotionState = {
      position: new Vec3(r, 0, 0),
      velocity: new Vec3(0, speed, 0),
    };
    const dt = 1; // 1 second steps
    const period = 2 * Math.PI * Math.sqrt(r ** 3 / (G * center.mass));
    const steps = Math.round(period / dt);
    for (let i = 0; i < steps; i++) {
      state = verletStep(state, dt, (pos) => gravityAccel(pos, [center]));
    }
    // radius drift under 1% after a full orbit
    expect(state.position.length()).toBeGreaterThan(r * 0.99);
    expect(state.position.length()).toBeLessThan(r * 1.01);
  });

  it("applies constant acceleration like kinematics (x = ½ a t^2)", () => {
    let state: MotionState = { position: Vec3.zero(), velocity: Vec3.zero() };
    const a = new Vec3(0, 0, 10);
    const dt = 0.01;
    for (let i = 0; i < 100; i++) {
      state = verletStep(state, dt, () => a);
    }
    // after t=1s: position z = 0.5*10*1^2 = 5, velocity z = 10
    expect(state.position.z).toBeCloseTo(5, 4);
    expect(state.velocity.z).toBeCloseTo(10, 4);
  });

  it("does not mutate the input state", () => {
    const original: MotionState = {
      position: new Vec3(1, 0, 0),
      velocity: new Vec3(0, 1, 0),
    };
    verletStep(original, 1, () => new Vec3(0, 0, 0));
    expect(original.position).toEqual(new Vec3(1, 0, 0));
    expect(original.velocity).toEqual(new Vec3(0, 1, 0));
  });
});
