import { describe, it, expect } from "vitest";
import {
  surfaceGravity,
  createSolarSystem,
  findBody,
  CAPTURE_RADIUS_FACTOR,
} from "../../src/sim/Body";

describe("Body (toy solar system)", () => {
  const bodies = createSolarSystem();

  it("has the Sun, eight planets, and the Moon", () => {
    expect(bodies).toHaveLength(10);
    const names = bodies.map((b) => b.name);
    for (const name of [
      "Sun",
      "Mercury",
      "Venus",
      "Earth",
      "Moon",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("derives mass so each body has its designed surface gravity", () => {
    expect(surfaceGravity(findBody(bodies, "Earth"))).toBeCloseTo(10, 5);
    expect(surfaceGravity(findBody(bodies, "Moon"))).toBeCloseTo(3, 5);
    expect(surfaceGravity(findBody(bodies, "Jupiter"))).toBeCloseTo(22, 5);
  });

  it("makes every body landable except the Sun", () => {
    for (const b of bodies) {
      expect(b.landable).toBe(b.name !== "Sun");
    }
  });

  it("gives every body a capture bubble of CAPTURE_RADIUS_FACTOR radii", () => {
    for (const b of bodies) {
      expect(b.captureRadius).toBeCloseTo(b.radius * CAPTURE_RADIUS_FACTOR, 6);
    }
  });

  it("keeps all capture bubbles disjoint (no ambiguous slingshot zones)", () => {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const dist = bodies[i].position.sub(bodies[j].position).length();
        expect(dist).toBeGreaterThan(bodies[i].captureRadius + bodies[j].captureRadius);
      }
    }
  });

  it("keeps every body in the ecliptic (x/z) plane", () => {
    for (const b of bodies) expect(b.position.y).toBe(0);
  });

  it("has no atmospheres (arcade: no drag anywhere)", () => {
    for (const b of bodies) expect(b.atmosphere).toBeNull();
  });

  it("gives Saturn rings that sit outside its surface", () => {
    const saturn = findBody(bodies, "Saturn");
    expect(saturn.rings).toBeDefined();
    expect(saturn.rings!.inner).toBeGreaterThan(saturn.radius);
    expect(saturn.rings!.outer).toBeGreaterThan(saturn.rings!.inner);
  });

  it("findBody throws on unknown names", () => {
    expect(() => findBody(bodies, "Pluto")).toThrow(/Unknown body/);
  });
});
