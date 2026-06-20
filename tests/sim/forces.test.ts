import { describe, it, expect } from "vitest";
import { shipAccel, shipAccelFn } from "../../src/sim/forces";
import { createSpacecraft } from "../../src/sim/Spacecraft";
import { createSolarSystem } from "../../src/sim/Body";
import { gravityAccel } from "../../src/sim/gravity";
import { thrustAccel } from "../../src/sim/Spacecraft";
import { verletStep } from "../../src/sim/integrator";
import { Vec3 } from "../../src/sim/Vec3";

describe("shipAccel", () => {
  it("equals gravityAccel when throttle=0 and velocity=0 (no thrust, no drag)", () => {
    // Far from all bodies — tiny gravity, definitely no drag.
    const bodies = createSolarSystem();
    // Position 1e10 m from origin (far beyond Moon orbit), zero velocity.
    const farPosition = new Vec3(1e10, 0, 0);
    const ship = createSpacecraft(farPosition);
    // Explicitly zero throttle and velocity
    const testShip = { ...ship, throttle: 0, velocity: Vec3.zero() };
    const vel = Vec3.zero();

    const result = shipAccel(testShip, bodies, farPosition, vel);
    const expected = gravityAccel(farPosition, bodies);

    expect(result.x).toBeCloseTo(expected.x, 15);
    expect(result.y).toBeCloseTo(expected.y, 15);
    expect(result.z).toBeCloseTo(expected.z, 15);
  });

  it("shipAccel result magnitude is near-zero far from all bodies with throttle=0 and velocity=0", () => {
    const bodies = createSolarSystem();
    const farPosition = new Vec3(1e10, 0, 0);
    const ship = createSpacecraft(farPosition);
    const testShip = { ...ship, throttle: 0, velocity: Vec3.zero() };

    const result = shipAccel(testShip, bodies, farPosition, Vec3.zero());
    // Should be very small — just tiny gravity at 1e10 m (~4e-6 m/s² from Earth)
    expect(result.length()).toBeLessThan(1e-5);
  });

  it("includes thrust term when throttle=1 and evaluated far from atmosphere (drag ~0)", () => {
    const bodies = createSolarSystem();
    // Far from Earth's atmosphere (beyond Moon), so drag ~= 0
    const farPosition = new Vec3(1e10, 0, 0);
    const ship = createSpacecraft(farPosition);
    const thrustingShip = { ...ship, throttle: 1, orientation: new Vec3(0, 1, 0) };

    const accelResult = shipAccel(thrustingShip, bodies, farPosition, Vec3.zero());
    const gravOnly = gravityAccel(farPosition, bodies);
    const thrustOnly = thrustAccel(thrustingShip);

    // The non-gravity portion should have length ≈ thrustAccel.length()
    const nonGravity = accelResult.sub(gravOnly);
    expect(nonGravity.length()).toBeCloseTo(thrustOnly.length(), 3);
  });

  it("does NOT mutate the input ship's position or velocity", () => {
    const bodies = createSolarSystem();
    const position = new Vec3(1e10, 0, 0);
    const velocity = new Vec3(100, 200, 300);
    const ship = createSpacecraft(position);
    const testShip = { ...ship, velocity, throttle: 0 };
    const evalPos = new Vec3(2e10, 0, 0);
    const evalVel = new Vec3(500, 0, 0);

    // Record original position/velocity
    const origPosX = testShip.position.x;
    const origVelX = testShip.velocity.x;

    shipAccel(testShip, bodies, evalPos, evalVel);

    // Ship position/velocity must be unchanged
    expect(testShip.position.x).toBe(origPosX);
    expect(testShip.velocity.x).toBe(origVelX);
  });
});

describe("shipAccelFn integration with verletStep", () => {
  it("ship falls toward Earth under gravity alone over 60 steps", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];
    // Start 1000 km above Earth's surface (well above atmosphere ~100 km)
    // but close enough for gravity to be measurable over 60 steps
    const startAltitude = earth.radius + 1_000_000; // 1000 km above surface
    const startPos = new Vec3(startAltitude, 0, 0);
    const ship = createSpacecraft(startPos);
    const coasting = { ...ship, throttle: 0, velocity: Vec3.zero() };

    const accelFn = shipAccelFn(coasting, bodies);
    const dt = 1 / 60;

    let state = { position: startPos.clone(), velocity: Vec3.zero() };
    for (let i = 0; i < 60; i++) {
      state = verletStep(state, dt, accelFn);
    }

    // Under Earth gravity the ship should have moved toward Earth (x decreasing)
    expect(state.position.x).toBeLessThan(startAltitude);
    // And velocity should be negative x (falling inward)
    expect(state.velocity.x).toBeLessThan(0);
  });

  it("drag decelerates a fast-moving ship deep in atmosphere vs no-atmosphere case", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];

    // Start at ~50 km altitude (dense atmosphere), moving fast tangentially
    const altitudeM = earth.radius + 50_000;
    const startPos = new Vec3(altitudeM, 0, 0);
    // High tangential speed (orbital-ish) to ensure drag is significant
    const fastVelocity = new Vec3(0, 7_000, 0); // 7 km/s tangential

    const ship = createSpacecraft(startPos);
    const fastShip = { ...ship, throttle: 0, velocity: fastVelocity.clone() };

    const accelFnWithAtmo = shipAccelFn(fastShip, bodies);

    // No-atmosphere case: use only Moon (no atmosphere body)
    const moonOnly = [bodies[1]]; // Moon has no atmosphere
    const accelFnNoAtmo = shipAccelFn(fastShip, moonOnly);

    const dt = 1 / 60;
    let stateAtmo = { position: startPos.clone(), velocity: fastVelocity.clone() };
    let stateNoAtmo = { position: startPos.clone(), velocity: fastVelocity.clone() };

    for (let i = 0; i < 60; i++) {
      stateAtmo = verletStep(stateAtmo, dt, accelFnWithAtmo);
      stateNoAtmo = verletStep(stateNoAtmo, dt, accelFnNoAtmo);
    }

    // With atmosphere drag, the tangential speed (y component) should be
    // less than without atmosphere drag
    const speedAtmo = stateAtmo.velocity.length();
    const speedNoAtmo = stateNoAtmo.velocity.length();
    expect(speedAtmo).toBeLessThan(speedNoAtmo);
  });
});
