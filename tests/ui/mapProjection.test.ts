import { describe, expect, it } from "vitest";
import { projectSystem, MAP_RADIUS_GAMMA } from "../../src/ui/mapProjection";
import { createSolarSystem, findBody } from "../../src/sim/Body";

const W = 960;
const H = 720;
const MARGIN = 40;

describe("projectSystem — schematic orrery projection", () => {
  const bodies = createSolarSystem();
  const proj = projectSystem(bodies, W, H, MARGIN);
  const point = (name: string) => proj.points.find((p) => p.name === name)!;

  it("pins the Sun to the canvas centre", () => {
    expect(point("Sun").px).toBeCloseTo(W / 2, 6);
    expect(point("Sun").py).toBeCloseTo(H / 2, 6);
  });

  it("keeps every body inside the margins", () => {
    for (const p of proj.points) {
      expect(p.px).toBeGreaterThanOrEqual(MARGIN);
      expect(p.px).toBeLessThanOrEqual(W - MARGIN);
      expect(p.py).toBeGreaterThanOrEqual(MARGIN);
      expect(p.py).toBeLessThanOrEqual(H - MARGIN);
    }
  });

  it("compresses radii so the inner system stays readable", () => {
    // Real scale would put Mercury at ~11% of Neptune's ring; the schematic
    // pulls it out so inner-system dots are not one unreadable clump.
    const sun = point("Sun");
    const rMercury = Math.hypot(point("Mercury").px - sun.px, point("Mercury").py - sun.py);
    const rNeptune = Math.hypot(point("Neptune").px - sun.px, point("Neptune").py - sun.py);
    expect(rMercury / rNeptune).toBeGreaterThan(0.2);
    expect(MAP_RADIUS_GAMMA).toBeLessThan(1);
  });

  it("preserves each body's bearing from the Sun", () => {
    const earth = findBody(bodies, "Earth");
    const worldAngle = Math.atan2(earth.position.z, earth.position.x);
    const sun = point("Sun");
    const mapAngle = Math.atan2(point("Earth").py - sun.py, point("Earth").px - sun.px);
    expect(mapAngle).toBeCloseTo(worldAngle, 6);
  });

  it("keeps orbit rings ordered like the real orbital distances", () => {
    expect(proj.rings.length).toBe(8); // one per planet
    for (let i = 1; i < proj.rings.length; i++) {
      expect(proj.rings[i]).toBeGreaterThan(proj.rings[i - 1]);
    }
  });

  it("pushes the Moon a clickable distance away from Earth", () => {
    const sep = Math.hypot(
      point("Moon").px - point("Earth").px,
      point("Moon").py - point("Earth").py,
    );
    expect(sep).toBeGreaterThanOrEqual(20);
  });

  it("projects arbitrary ship positions consistently (on Earth = at Earth's dot)", () => {
    const earth = findBody(bodies, "Earth");
    const s = proj.project(earth.position.x, earth.position.z);
    expect(Math.hypot(s.px - point("Earth").px, s.py - point("Earth").py)).toBeLessThan(1);
  });

  it("clamps far-out ship positions to the map edge instead of losing them", () => {
    const s = proj.project(50_000_000, 0); // way past Neptune
    expect(s.px).toBeLessThanOrEqual(W - MARGIN);
    expect(s.px).toBeGreaterThanOrEqual(MARGIN);
  });
});
