import { describe, it, expect } from "vitest";
import {
  DEFAULT_LS_PARAMS,
  lightspeedStep,
  freeCruiseStep,
  brakeStep,
  etaSeconds,
} from "../../src/sim/lightspeed";
import { createSolarSystem, findBody, Body } from "../../src/sim/Body";
import { Vec3 } from "../../src/sim/Vec3";

const P = DEFAULT_LS_PARAMS;
const DT = 1 / 60;
const bodies = createSolarSystem();
const NO_STEER = { x: 0, y: 0 };

// Fly the full profile from `pos` to `target`; returns trip stats.
function fly(
  pos: Vec3,
  target: Body,
  steer = NO_STEER,
  maxSeconds = 120,
): { t: number; pos: Vec3; vel: Vec3; done: boolean } {
  let p = pos.clone();
  let v = Vec3.zero();
  let t = 0;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const r = lightspeedStep(p, v, target, steer, DT, P);
    p = r.pos;
    v = r.vel;
    t += DT;
    if (r.done) return { t, pos: p, vel: v, done: true };
  }
  return { t, pos: p, vel: v, done: false };
}

function from(name: string): Vec3 {
  const b = findBody(bodies, name);
  return b.position.add(new Vec3(0, b.radius * 2, 0));
}

describe("lightspeedStep trip times", () => {
  it("Earth -> Moon is a quick hop (under 12 s)", () => {
    const r = fly(from("Earth"), findBody(bodies, "Moon"));
    expect(r.done).toBe(true);
    expect(r.t).toBeLessThan(12);
  });

  it("Earth -> Jupiter is a proper voyage (15-35 s)", () => {
    const r = fly(from("Earth"), findBody(bodies, "Jupiter"));
    expect(r.done).toBe(true);
    expect(r.t).toBeGreaterThan(15);
    expect(r.t).toBeLessThan(35);
  });

  it("Mercury -> Neptune, the longest hop, stays under 50 s", () => {
    const r = fly(from("Mercury"), findBody(bodies, "Neptune"));
    expect(r.done).toBe(true);
    expect(r.t).toBeLessThan(50);
  });
});

describe("lightspeedStep arrival invariants", () => {
  const mars = findBody(bodies, "Mars");

  it("arrives exactly on the capture ring at vArrive, aimed at a flyby point", () => {
    const r = fly(from("Earth"), mars);
    expect(r.done).toBe(true);
    const dist = r.pos.sub(mars.position).length();
    expect(dist).toBeCloseTo(mars.captureRadius, 0);
    expect(r.vel.length()).toBeCloseTo(P.vArrive, 3);
    // The handoff heads into the bubble, but never dead-center: the ballistic
    // closest approach matches the flyby offset (a clean slingshot entry that
    // also whiffs safely past the surface if nothing captures it).
    const inward = mars.position.sub(r.pos).normalize();
    expect(r.vel.normalize().dot(inward)).toBeGreaterThan(0.5);
    const missDistance = mars.position.sub(r.pos).cross(r.vel.normalize()).length();
    const offset = P.flybyRadiusFactor * mars.radius;
    expect(missDistance).toBeGreaterThan(offset * 0.7); // well clear of the surface
    expect(missDistance).toBeLessThan(offset * 1.2); // near the sling sweet spot
    expect(missDistance).toBeGreaterThan(mars.radius);
  });

  it("never tunnels past the drop radius, even at vMax", () => {
    // Start a cruise already at vMax pointed at the target.
    const start = mars.position.add(new Vec3(2e6, 0, 0));
    const dir = mars.position.sub(start).normalize();
    let p = start;
    let v = dir.scale(P.vMax);
    for (let i = 0; i < 60 * 60; i++) {
      const r = lightspeedStep(p, v, mars, NO_STEER, DT, P);
      p = r.pos;
      v = r.vel;
      expect(p.sub(mars.position).length()).toBeGreaterThanOrEqual(mars.captureRadius - 1);
      if (r.done) return;
    }
    throw new Error("never arrived");
  });

  it("closes distance monotonically with zero steer", () => {
    let p = from("Earth");
    let v = Vec3.zero();
    let last = p.sub(mars.position).length();
    for (let i = 0; i < 60 * 5; i++) {
      const r = lightspeedStep(p, v, mars, NO_STEER, DT, P);
      p = r.pos;
      v = r.vel;
      const d = p.sub(mars.position).length();
      expect(d).toBeLessThan(last);
      last = d;
    }
  });
});

describe("lightspeedStep steering", () => {
  it("steering shifts the path but stays clamped", () => {
    const mars = findBody(bodies, "Mars");
    const straight = fly(from("Earth"), mars);
    const steered = fly(from("Earth"), mars, { x: 1, y: 0 });
    expect(steered.done).toBe(true);
    // Both arrive on the ring; the steered path takes at least as long.
    expect(steered.t).toBeGreaterThanOrEqual(straight.t);
    // Absurd steer input deflects no further than steerMax allows.
    const p0 = from("Earth");
    const r1 = lightspeedStep(p0, Vec3.zero(), mars, { x: 10, y: 0 }, DT, P);
    const r2 = lightspeedStep(p0, Vec3.zero(), mars, { x: 1, y: 0 }, DT, P);
    expect(r1.vel.normalize().dot(r2.vel.normalize())).toBeCloseTo(1, 6);
  });
});

describe("brakeStep", () => {
  it("bleeds speed down to a landable drift without changing direction", () => {
    let v = new Vec3(0, 0, 1).scale(P.vMax);
    for (let i = 0; i < 60 * 30; i++) {
      const r = brakeStep(v, DT, P);
      v = r.vel;
      if (r.done) break;
    }
    expect(v.length()).toBeCloseTo(P.vDrift, 3);
    expect(v.normalize().z).toBeCloseTo(1, 6);
  });

  it("leaves slow ships alone", () => {
    const v = new Vec3(100, 0, 0);
    const r = brakeStep(v, DT, P);
    expect(r.done).toBe(true);
    expect(r.vel.length()).toBeCloseTo(100, 6);
  });
});

describe("etaSeconds", () => {
  it("roughly matches the simulated trip time", () => {
    const mars = findBody(bodies, "Mars");
    const start = from("Earth");
    const eta = etaSeconds(start.sub(mars.position).length() - mars.captureRadius, 0, P);
    const actual = fly(start, mars).t;
    expect(Math.abs(eta - actual)).toBeLessThan(actual * 0.15);
  });

  it("is zero at (or inside) the drop radius", () => {
    expect(etaSeconds(0, 5000, P)).toBe(0);
    expect(etaSeconds(-100, 5000, P)).toBe(0);
  });
});

describe("freeCruiseStep — point-and-fly, no destination", () => {
  const p = DEFAULT_LS_PARAMS;
  const dt = 1 / 120;

  // Fly from pos along dir until dropout or timeout; returns the last result.
  function flyFree(pos: Vec3, dir: Vec3, obstacles: Body[], maxSec = 120) {
    let vel = dir.scale(1);
    let d = dir;
    for (let t = 0; t < maxSec; t += dt) {
      const r = freeCruiseStep(pos, vel, d, { x: 0, y: 0 }, dt, obstacles);
      pos = r.pos;
      vel = r.vel;
      d = r.dir;
      if (r.done) return { ...r, t };
    }
    return null;
  }

  it("accelerates along the nose to vMax with nothing ahead", () => {
    let pos = new Vec3(0, 1e9, 0); // far above the ecliptic — empty sky
    let vel = new Vec3(0, 0, 0);
    let dir = new Vec3(0, 1, 0);
    for (let t = 0; t < 60; t += dt) {
      const r = freeCruiseStep(pos, vel, dir, { x: 0, y: 0 }, dt, bodies);
      pos = r.pos;
      vel = r.vel;
      expect(r.done).toBe(false);
    }
    expect(vel.length()).toBeCloseTo(p.vMax, 0);
    expect(vel.normalize().dot(dir)).toBeCloseTo(1, 5);
  });

  it("drops out at the ring of a body dead ahead, at vArrive, inbound", () => {
    const mars = findBody(bodies, "Mars");
    const start = mars.position.add(new Vec3(500_000, 0, 0));
    const r = flyFree(start, new Vec3(-1, 0, 0), bodies);
    expect(r).not.toBeNull();
    const dist = r!.pos.sub(mars.position).length();
    expect(dist).toBeLessThanOrEqual(mars.captureRadius * 1.01);
    expect(r!.vel.length()).toBeCloseTo(p.vArrive, 0);
    // moving inward, toward the body
    expect(r!.vel.dot(mars.position.sub(r!.pos))).toBeGreaterThan(0);
  });

  it("hands off aimed at a flyby offset, never dead-centre", () => {
    const mars = findBody(bodies, "Mars");
    const start = mars.position.add(new Vec3(500_000, 0, 0));
    const r = flyFree(start, new Vec3(-1, 0, 0), bodies)!;
    // Project the handoff ray to closest approach: must miss the core.
    const toBody = mars.position.sub(r.pos);
    const along = r.vel.normalize();
    const closest = toBody.sub(along.scale(toBody.dot(along))).length();
    expect(closest).toBeGreaterThan(mars.radius);
  });

  it("ignores the bubble it starts inside — launches escape their own planet", () => {
    const earth = findBody(bodies, "Earth");
    const pad = earth.position.add(new Vec3(0, earth.radius, 0));
    let pos = pad;
    let vel = new Vec3(0, 0, 0);
    const up = new Vec3(0, 1, 0);
    for (let t = 0; t < 3; t += dt) {
      const r = freeCruiseStep(pos, vel, up, { x: 0, y: 0 }, dt, bodies);
      expect(r.done).toBe(false); // must not instantly re-arrive at Earth
      pos = r.pos;
      vel = r.vel;
    }
    expect(pos.sub(earth.position).length()).toBeGreaterThan(earth.captureRadius);
  });

  it("flies straight past bubbles the ray misses", () => {
    const mars = findBody(bodies, "Mars");
    // Aim well wide of Mars: lateral offset 3x the capture radius.
    const start = mars.position.add(new Vec3(500_000, 0, mars.captureRadius * 3));
    const r = flyFree(start, new Vec3(-1, 0, 0), bodies, 10);
    expect(r).toBeNull(); // never dropped out
  });

  it("steering bends the persistent cruise direction", () => {
    const pos = new Vec3(0, 1e9, 0);
    const vel = new Vec3(0, 0, p.vMax);
    const dir = new Vec3(0, 0, 1);
    const r = freeCruiseStep(pos, vel, dir, { x: 1, y: 0 }, dt, []);
    expect(r.dir.dot(dir)).toBeLessThan(1 - 1e-6);
    expect(r.dir.length()).toBeCloseTo(1, 6);
  });
});
