import { describe, it, expect } from "vitest";
import { gravityAccel } from "../../src/sim/gravity";
import { Vec3 } from "../../src/sim/Vec3";
import { createSolarSystem, surfaceGravity } from "../../src/sim/Body";

describe("gravityAccel", () => {
  it("matches surface gravity at Earth's surface, pointing inward", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];
    const surface = new Vec3(earth.radius, 0, 0); // straight above center on +x
    const a = gravityAccel(surface, bodies);
    // dominated by Earth; magnitude ~9.81, direction toward center (-x)
    expect(a.length()).toBeCloseTo(surfaceGravity(earth), 1);
    expect(a.x).toBeLessThan(0);
  });

  it("returns zero when coincident with the only body's center", () => {
    const bodies = createSolarSystem();
    const a = gravityAccel(bodies[0].position, [bodies[0]]);
    expect(a.length()).toBe(0);
  });

  it("sums contributions from multiple bodies", () => {
    const bodies = createSolarSystem();
    const midpoint = new Vec3(bodies[1].position.x / 2, 0, 0);
    const a = gravityAccel(midpoint, bodies);
    // Earth pulls -x, Moon pulls +x; Earth wins so net is -x but small
    expect(a.x).toBeLessThan(0);
    expect(a.length()).toBeLessThan(surfaceGravity(bodies[0]));
  });
});
