import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { rotateAttitude, thrustDirection, ROT_RATE } from "../../src/game/attitude";
import { Intent } from "../../src/sim/input/bindings";

function fakeInput(active: Intent[]) {
  return { isActive: (i: Intent) => active.includes(i) };
}

describe("attitude", () => {
  it("thrustDirection of identity quaternion is +Y", () => {
    const d = thrustDirection(new THREE.Quaternion());
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(1, 6);
    expect(d.z).toBeCloseTo(0, 6);
  });

  it("does nothing when no rotation intents are active", () => {
    const q0 = new THREE.Quaternion();
    const q1 = rotateAttitude(q0, fakeInput([]), 1);
    expect(q1.angleTo(q0)).toBeCloseTo(0, 6);
  });

  it("pitch rotates the thrust direction away from +Y by ROT_RATE*dt", () => {
    const q1 = rotateAttitude(new THREE.Quaternion(), fakeInput(["pitchUp"]), 1);
    const d = thrustDirection(q1);
    const up = new THREE.Vector3(0, 1, 0);
    const angle = up.angleTo(new THREE.Vector3(d.x, d.y, d.z));
    expect(angle).toBeCloseTo(ROT_RATE, 2);
  });

  it("does not mutate the input quaternion", () => {
    const q0 = new THREE.Quaternion();
    rotateAttitude(q0, fakeInput(["yawLeft"]), 1);
    expect(q0.x).toBe(0);
    expect(q0.y).toBe(0);
    expect(q0.z).toBe(0);
    expect(q0.w).toBe(1);
  });
});
