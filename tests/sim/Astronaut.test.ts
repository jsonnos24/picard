import { describe, it, expect } from "vitest";
import { createAstronaut, stepAstronaut } from "../../src/sim/Astronaut";
import { createSolarSystem } from "../../src/sim/Body";
import { Vec3 } from "../../src/sim/Vec3";

// Use the Moon for 1/6-g behavior. Put astronaut on the +x surface.
function moonSurfaceAstronaut() {
  const [, moon] = createSolarSystem();
  const a = createAstronaut(new Vec3(moon.radius, 0, 0).add(moon.position));
  a.onGround = true;
  return { a, moon };
}

describe("Astronaut", () => {
  it("stays on the surface when standing still", () => {
    const { a, moon } = moonSurfaceAstronaut();
    const next = stepAstronaut(a, moon, Vec3.zero(), false, 1 / 60);
    const altitude = next.position.sub(moon.position).length() - moon.radius;
    expect(altitude).toBeCloseTo(0, 3);
    expect(next.onGround).toBe(true);
  });

  it("moves horizontally at walk speed", () => {
    const { a, moon } = moonSurfaceAstronaut();
    // horizontal (tangent) direction at +x surface is +y
    const next = stepAstronaut(a, moon, new Vec3(0, 1, 0), false, 1);
    // moved roughly WALK_SPEED metres in +y over 1 second
    expect(next.position.y).toBeGreaterThan(2.5);
    expect(next.position.y).toBeLessThan(3.5);
  });

  it("jumps higher under Moon gravity than it would on Earth (1/6 g feel)", () => {
    const { a, moon } = moonSurfaceAstronaut();
    let s = stepAstronaut(a, moon, Vec3.zero(), true, 1 / 60); // jump
    let maxAlt = 0;
    for (let i = 0; i < 600; i++) {
      s = stepAstronaut(s, moon, Vec3.zero(), false, 1 / 60);
      const alt = s.position.sub(moon.position).length() - moon.radius;
      maxAlt = Math.max(maxAlt, alt);
    }
    // apex ~ v^2/(2g) = 16/(2*1.62) ~ 4.9 m on the Moon; assert clearly > 1 m
    expect(maxAlt).toBeGreaterThan(1);
  });

  it("does not sink below the surface", () => {
    const { a, moon } = moonSurfaceAstronaut();
    let s = a;
    for (let i = 0; i < 120; i++) {
      s = stepAstronaut(s, moon, Vec3.zero(), false, 1 / 60);
    }
    const altitude = s.position.sub(moon.position).length() - moon.radius;
    expect(altitude).toBeGreaterThanOrEqual(-0.001);
  });
});
