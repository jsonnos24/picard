import { describe, it, expect } from "vitest";
import { selectPrimaryBody } from "../../src/game/primaryBody";
import { createSolarSystem } from "../../src/sim/Body";
import { Vec3 } from "../../src/sim/Vec3";

describe("selectPrimaryBody", () => {
  it("picks Earth and reports altitude near Earth's surface", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];
    const pos = new Vec3(0, earth.radius + 1000, 0);
    const pb = selectPrimaryBody(pos, bodies);
    expect(pb.body.name).toBe("Earth");
    expect(pb.altitude).toBeCloseTo(1000, 0);
  });

  it("picks the Moon when near the Moon's surface", () => {
    const bodies = createSolarSystem();
    const moon = bodies[1];
    const pos = moon.position.add(new Vec3(0, moon.radius + 500, 0));
    const pb = selectPrimaryBody(pos, bodies);
    expect(pb.body.name).toBe("Moon");
    expect(pb.altitude).toBeCloseTo(500, 0);
  });

  it("reports local up as the unit vector from body center to position", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];
    const pos = new Vec3(0, earth.radius + 1000, 0);
    const pb = selectPrimaryBody(pos, bodies);
    expect(pb.up.x).toBeCloseTo(0, 6);
    expect(pb.up.y).toBeCloseTo(1, 6);
    expect(pb.up.z).toBeCloseTo(0, 6);
  });
});
