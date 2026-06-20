import { describe, it, expect } from "vitest";
import { surfaceGravity, createSolarSystem } from "../../src/sim/Body";
import { DISTANCE_SCALE } from "../../src/sim/constants";

describe("Body", () => {
  it("computes Earth surface gravity ~9.81 m/s^2", () => {
    const [earth] = createSolarSystem();
    expect(surfaceGravity(earth)).toBeCloseTo(9.81, 1);
  });

  it("computes Moon surface gravity ~1.62 m/s^2", () => {
    const [, moon] = createSolarSystem();
    expect(surfaceGravity(moon)).toBeCloseTo(1.62, 1);
  });

  it("places the Moon at the compressed distance along +x", () => {
    const [, moon] = createSolarSystem();
    expect(moon.position.x).toBeCloseTo(3.844e8 * DISTANCE_SCALE, 0);
    expect(moon.position.y).toBe(0);
    expect(moon.position.z).toBe(0);
  });

  it("gives Earth an atmosphere and the Moon none", () => {
    const [earth, moon] = createSolarSystem();
    expect(earth.atmosphere).not.toBeNull();
    expect(moon.atmosphere).toBeNull();
  });
});
