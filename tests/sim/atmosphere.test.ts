import { describe, it, expect } from "vitest";
import { airDensity, dragAccel } from "../../src/sim/atmosphere";
import { realPair } from "../helpers/fixtures";
import { createSpacecraft } from "../../src/sim/Spacecraft";
import { Vec3 } from "../../src/sim/Vec3";

describe("atmosphere", () => {
  it("returns sea-level density at altitude 0 for Earth", () => {
    const [earth] = realPair();
    expect(airDensity(earth, 0)).toBeCloseTo(1.225, 3);
  });

  it("decreases density exponentially with altitude", () => {
    const [earth] = realPair();
    const sh = earth.atmosphere!.scaleHeight;
    expect(airDensity(earth, sh)).toBeCloseTo(1.225 / Math.E, 3);
  });

  it("returns zero density for an airless body (Moon)", () => {
    const [, moon] = realPair();
    expect(airDensity(moon, 0)).toBe(0);
  });

  it("produces drag opposing velocity inside Earth's atmosphere", () => {
    const [earth] = realPair();
    const s = createSpacecraft(new Vec3(earth.radius + 1000, 0, 0));
    s.velocity = new Vec3(0, 200, 0); // moving +y fast, low altitude
    const a = dragAccel(s, [earth]);
    expect(a.y).toBeLessThan(0); // opposes +y motion
    expect(a.length()).toBeGreaterThan(0);
  });

  it("produces no drag in vacuum near the Moon", () => {
    const [, moon] = realPair();
    const s = createSpacecraft(moon.position.add(new Vec3(moon.radius + 1000, 0, 0)));
    s.velocity = new Vec3(0, 200, 0);
    expect(dragAccel(s, [moon]).length()).toBe(0);
  });
});
