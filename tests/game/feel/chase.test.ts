// tests/game/feel/chase.test.ts
import { describe, it, expect } from "vitest";
import {
  chaseFrame,
  smoothToward,
  DEFAULT_CHASE_PARAMS,
  SlingView,
} from "../../../src/game/feel/chase";
import { Vec3 } from "../../../src/sim/Vec3";

const P = DEFAULT_CHASE_PARAMS;
const shipPos = new Vec3(100, 200, 300);
const fwd = new Vec3(0, 1, 0);
const up = new Vec3(0, 0, 1);

describe("chaseFrame", () => {
  it("sits behind and above the ship, looking ahead", () => {
    const f = chaseFrame(shipPos, fwd, up, 0, null, null, P);
    const rel = f.camPos.sub(shipPos);
    expect(rel.dot(fwd)).toBeLessThan(0); // behind
    expect(rel.dot(up)).toBeGreaterThan(0); // above
    expect(f.lookAt.sub(shipPos).dot(fwd)).toBeGreaterThan(0); // ahead
  });

  it("pulls back with speed, saturating at vRef", () => {
    const slow = chaseFrame(shipPos, fwd, up, 0, null, null, P);
    const fast = chaseFrame(shipPos, fwd, up, P.vRef, null, null, P);
    const faster = chaseFrame(shipPos, fwd, up, P.vRef * 100, null, null, P);
    const d = (f: { camPos: Vec3 }): number => f.camPos.sub(shipPos).length();
    expect(d(fast)).toBeGreaterThan(d(slow));
    expect(d(faster)).toBeCloseTo(d(fast), 6);
  });

  it("orbit-cams while slung: planet dead-centre with the ship in frame", () => {
    const sling: SlingView = {
      center: shipPos.add(new Vec3(5000, 0, 0)),
      normal: new Vec3(0, 0, 1),
      bodyRadius: 2000,
    };
    const f = chaseFrame(shipPos, fwd, up, 4000, sling, null, P);
    // The aim is locked on the planet — that's what keeps it centred on screen.
    expect(f.lookAt.sub(sling.center).length()).toBeLessThan(1e-6);
    // Camera sits on the far side of the ship from the planet…
    const outward = shipPos.sub(sling.center).normalize();
    expect(f.camPos.sub(shipPos).dot(outward)).toBeGreaterThan(0);
    // …so the ship reads in the foreground: the view rays to ship and planet
    // are nearly parallel.
    const toShip = shipPos.sub(f.camPos).normalize();
    const toPlanet = sling.center.sub(f.camPos).normalize();
    expect(toShip.dot(toPlanet)).toBeGreaterThan(0.9);
  });

  it("orbit cam keeps the planet centred all the way around a swing lap", () => {
    const center = new Vec3(0, 0, 0);
    const normal = new Vec3(0, 0, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pos = new Vec3(Math.cos(a) * 9000, Math.sin(a) * 9000, 0);
      const tangent = new Vec3(-Math.sin(a), Math.cos(a), 0); // nose on the rail
      const f = chaseFrame(pos, tangent, normal, 3000, { center, normal, bodyRadius: 2000 }, null, P);
      expect(f.lookAt.sub(center).length()).toBeLessThan(1e-6);
      const toShip = pos.sub(f.camPos).normalize();
      const toPlanet = center.sub(f.camPos).normalize();
      expect(toShip.dot(toPlanet)).toBeGreaterThan(0.9);
    }
  });

  it("produces finite output for any speed and degenerate sling normals", () => {
    const sling: SlingView = { center: shipPos, normal: new Vec3(0, 1, 0), bodyRadius: 1 };
    for (const speed of [0, 1e9, NaN]) {
      const f = chaseFrame(shipPos, fwd, up, speed, sling, null, P);
      for (const v of [f.camPos, f.lookAt]) {
        expect(Number.isFinite(v.x)).toBe(true);
        expect(Number.isFinite(v.y)).toBe(true);
        expect(Number.isFinite(v.z)).toBe(true);
      }
    }
  });

  // The launch-pad regression: a nose-up rocket must never put the camera
  // underground ("behind" the ship is straight down into the planet).
  it("never frames a landed, nose-up ship from underground", () => {
    const radius = 3000;
    const center = new Vec3(0, 0, 0);
    const padShip = new Vec3(0, radius + 7, 0); // north-pole pad
    const noseUp = new Vec3(0, 1, 0);
    const shipUp = new Vec3(0, 0, 1);
    const ground = { center, radius, up: new Vec3(0, 1, 0), altitude: 0 };
    const f = chaseFrame(padShip, noseUp, shipUp, 0, null, ground, P);
    expect(f.camPos.sub(center).length()).toBeGreaterThan(radius); // outside the planet
    expect(f.camPos.dot(ground.up)).toBeGreaterThan(padShip.dot(ground.up)); // above the ship
    expect(f.groundness).toBeCloseTo(1, 6);
  });

  it("hard-clamps the camera outside the surface even in weird attitudes", () => {
    const radius = 3000;
    const center = new Vec3(0, 0, 0);
    const ship = new Vec3(0, radius + 30, 0);
    const noseDown = new Vec3(0, -1, 0); // diving straight at the pad
    const ground = { center, radius, up: new Vec3(0, 1, 0), altitude: 30 };
    const f = chaseFrame(ship, noseDown, new Vec3(0, 0, 1), 200, null, ground, P);
    expect(f.camPos.sub(center).length()).toBeGreaterThanOrEqual(radius + P.surfaceMargin - 1e-6);
  });

  it("ground framing fades out with altitude", () => {
    const radius = 3000;
    const center = new Vec3(0, 0, 0);
    const high = chaseFrame(
      new Vec3(0, radius + P.groundAltRef * 2, 0),
      fwd,
      up,
      100,
      null,
      { center, radius, up: new Vec3(0, 1, 0), altitude: P.groundAltRef * 2 },
      P,
    );
    expect(high.groundness).toBe(0);
  });
});

describe("smoothToward", () => {
  it("converges exponentially onto the target", () => {
    let cur = new Vec3(0, 0, 0);
    const target = new Vec3(10, -4, 2);
    for (let i = 0; i < 600; i++) cur = smoothToward(cur, target, 6, 1 / 60);
    expect(cur.sub(target).length()).toBeLessThan(0.01);
  });

  it("moves proportionally more with a higher rate", () => {
    const cur = new Vec3(0, 0, 0);
    const target = new Vec3(1, 0, 0);
    const slow = smoothToward(cur, target, 2, 1 / 60);
    const fast = smoothToward(cur, target, 20, 1 / 60);
    expect(fast.x).toBeGreaterThan(slow.x);
    expect(fast.x).toBeLessThanOrEqual(1);
  });

  it("is stable for zero and negative dt", () => {
    const cur = new Vec3(1, 1, 1);
    const target = new Vec3(2, 2, 2);
    expect(smoothToward(cur, target, 6, 0).sub(cur).length()).toBe(0);
    expect(smoothToward(cur, target, 6, -1).sub(cur).length()).toBe(0);
  });
});
