import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { thrustDirection } from "../../src/game/attitude";

describe("attitude", () => {
  it("thrustDirection of identity quaternion is +Y", () => {
    const d = thrustDirection(new THREE.Quaternion());
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(1, 6);
    expect(d.z).toBeCloseTo(0, 6);
  });
});
