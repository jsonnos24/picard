// tests/game/feel/turning.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Intent } from "../../../src/sim/input/bindings";
import { stepTurning, zeroAngular, MAX_RATE } from "../../../src/game/feel/turning";

function fakeInput(active: Intent[], axes: { steerX?: number; steerY?: number } = {}) {
  return {
    isActive: (i: Intent) => active.includes(i),
    getAxis: (a: "steerX" | "steerY"): number => {
      if (axes[a] !== undefined) return axes[a]!;
      // Mirror InputManager's intent-derived fallback.
      return a === "steerX"
        ? (active.includes("yawRight") ? 1 : 0) - (active.includes("yawLeft") ? 1 : 0)
        : (active.includes("pitchUp") ? 1 : 0) - (active.includes("pitchDown") ? 1 : 0);
    },
  };
}

describe("turning (momentum)", () => {
  it("ramps up gradually — one short step is far below max rate", () => {
    const { state } = stepTurning(new THREE.Quaternion(), zeroAngular(), fakeInput(["pitchUp"]), 1 / 60);
    expect(state.pitch).toBeGreaterThan(0);
    expect(state.pitch).toBeLessThan(MAX_RATE * 0.5);
  });

  it("approaches MAX_RATE when held over time", () => {
    let s = zeroAngular();
    let q = new THREE.Quaternion();
    for (let i = 0; i < 600; i++) ({ quat: q, state: s } = stepTurning(q, s, fakeInput(["pitchUp"]), 1 / 60));
    expect(s.pitch).toBeCloseTo(MAX_RATE, 1);
  });

  it("eases out after release — rate decays toward zero, not instant stop", () => {
    let s = { pitch: MAX_RATE, yaw: 0, roll: 0 };
    let q = new THREE.Quaternion();
    ({ quat: q, state: s } = stepTurning(q, s, fakeInput([]), 1 / 60));
    expect(s.pitch).toBeGreaterThan(0);          // still coasting
    expect(s.pitch).toBeLessThan(MAX_RATE);      // but decaying
  });

  it("rotates the quaternion while a rate is non-zero", () => {
    const s = { pitch: MAX_RATE, yaw: 0, roll: 0 };
    const { quat } = stepTurning(new THREE.Quaternion(), s, fakeInput([]), 1 / 60);
    expect(quat.angleTo(new THREE.Quaternion())).toBeGreaterThan(0);
  });

  it("does not mutate the input quaternion or state", () => {
    const q0 = new THREE.Quaternion();
    const s0 = zeroAngular();
    stepTurning(q0, s0, fakeInput(["yawLeft"]), 1 / 60);
    expect(q0.equals(new THREE.Quaternion())).toBe(true);
    expect(s0.yaw).toBe(0);
  });

  it("a fractional analog axis targets a proportional rate", () => {
    let sFull = zeroAngular();
    let sHalf = zeroAngular();
    let q = new THREE.Quaternion();
    for (let i = 0; i < 600; i++) {
      ({ state: sFull } = stepTurning(q, sFull, fakeInput([], { steerY: 1 }), 1 / 60));
      ({ state: sHalf } = stepTurning(q, sHalf, fakeInput([], { steerY: 0.5 }), 1 / 60));
    }
    expect(sFull.pitch).toBeCloseTo(MAX_RATE, 1);
    expect(sHalf.pitch).toBeCloseTo(MAX_RATE * 0.5, 1);
  });

  it("steerX right-positive maps to a negative (rightward) yaw command", () => {
    const { state } = stepTurning(
      new THREE.Quaternion(),
      zeroAngular(),
      fakeInput([], { steerX: 1 }),
      1 / 60,
    );
    expect(state.yaw).toBeLessThan(0);
  });
});
