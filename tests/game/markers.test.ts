import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { projectMarker } from "../../src/game/markers";

function cam(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(70, 1, 0.1, 1e9);
  c.position.set(0, 0, 0);
  c.lookAt(0, 0, -1); // looking down -Z
  c.updateMatrixWorld(true);
  return c;
}

describe("projectMarker", () => {
  it("puts a point dead ahead near screen center", () => {
    const m = projectMarker(new THREE.Vector3(0, 0, -100), cam());
    expect(m.onScreen).toBe(true);
    expect(m.x).toBeCloseTo(0.5, 1);
    expect(m.y).toBeCloseTo(0.5, 1);
  });

  it("marks a point behind the camera as off-screen", () => {
    const m = projectMarker(new THREE.Vector3(0, 0, 100), cam());
    expect(m.onScreen).toBe(false);
  });

  it("clamps an off-screen point to the [0,1] range", () => {
    const m = projectMarker(new THREE.Vector3(1000, 0, -100), cam());
    expect(m.onScreen).toBe(false);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(1);
  });

  it("clamps a point far above the viewport to [0,1] and marks it off-screen", () => {
    const m = projectMarker(new THREE.Vector3(0, 1e6, -100), cam());
    expect(m.onScreen).toBe(false);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(1);
    expect(m.y).toBeGreaterThanOrEqual(0);
    expect(m.y).toBeLessThanOrEqual(1);
  });
});
