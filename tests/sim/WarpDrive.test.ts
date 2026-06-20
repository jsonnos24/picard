import { describe, it, expect } from "vitest";
import { safeApproachDistance, warpTo, SAFE_APPROACH_RADII } from "../../src/sim/WarpDrive";
import { createSolarSystem } from "../../src/sim/Body";
import { createSpacecraft } from "../../src/sim/Spacecraft";
import { Vec3 } from "../../src/sim/Vec3";

describe("WarpDrive", () => {
  it("computes a safe approach distance of SAFE_APPROACH_RADII body radii", () => {
    const [, moon] = createSolarSystem();
    expect(safeApproachDistance(moon)).toBeCloseTo(moon.radius * SAFE_APPROACH_RADII, 0);
  });

  it("drops the ship out at the safe approach distance from target center", () => {
    const [earth, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(earth.radius, 0, 0));
    const after = warpTo(ship, moon);
    const dist = after.position.sub(moon.position).length();
    expect(dist).toBeCloseTo(safeApproachDistance(moon), 0);
  });

  it("places the ship between the target and its prior position", () => {
    const [earth, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(earth.radius, 0, 0));
    const after = warpTo(ship, moon);
    // ship started on -x side of the Moon, so drop-out x < moon.x
    expect(after.position.x).toBeLessThan(moon.position.x);
  });

  it("orients the ship toward the target and zeroes velocity", () => {
    const [earth, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(earth.radius, 0, 0));
    ship.velocity = new Vec3(1000, 200, 50);
    const after = warpTo(ship, moon);
    expect(after.velocity.length()).toBe(0);
    // orientation points from ship toward moon (+x)
    const toTarget = moon.position.sub(after.position).normalize();
    expect(after.orientation.normalize().dot(toTarget)).toBeCloseTo(1, 6);
  });

  it("does not mutate the input ship", () => {
    const [, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(1e7, 0, 0));
    const posBefore = ship.position.clone();
    warpTo(ship, moon);
    expect(ship.position).toEqual(posBefore);
  });
});
