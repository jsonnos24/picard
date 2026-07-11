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

describe("lightspeedStep — Sun obstacle (guided cruise must not tunnel through it)", () => {
  const sun = findBody(bodies, "Sun"); // position (0,0,0), captureRadius 120_000
  const obstacle = { position: sun.position, bubbleRadius: sun.captureRadius };
  // A fake far-side target so the straight path runs squarely through the Sun.
  const beyondSun: Body = { ...findBody(bodies, "Mars"), position: new Vec3(500_000, 0, 0) };

  function flyObstacle(
    pos: Vec3,
    target: Body,
    maxSeconds = 60,
  ): { t: number; pos: Vec3; vel: Vec3; done: boolean; blocked: boolean } {
    let p = pos.clone();
    let v = Vec3.zero();
    let t = 0;
    for (let i = 0; i < maxSeconds * 60; i++) {
      const r = lightspeedStep(p, v, target, NO_STEER, DT, P, obstacle);
      p = r.pos;
      v = r.vel;
      t += DT;
      if (r.done) return { t, pos: p, vel: v, done: true, blocked: r.blocked === true };
    }
    return { t, pos: p, vel: v, done: false, blocked: false };
  }

  it("drops out at the bubble boundary when the straight path would tunnel through the Sun", () => {
    const start = new Vec3(-500_000, 0, 0);
    const r = flyObstacle(start, beyondSun);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(true);
    const distFromSun = r.pos.sub(sun.position).length();
    expect(distFromSun).toBeCloseTo(sun.captureRadius, 0);
    // Dropped on the near side (still negative x), well short of the target.
    expect(r.pos.x).toBeLessThan(0);
    expect(r.vel.length()).toBeCloseTo(P.vArrive, 3);
  });

  it("starts inside the bubble heading OUT: escapes freely (not blocked)", () => {
    // Semantics changed with the escape rule: outbound rays from inside the
    // bubble cruise normally — only rays diving deeper drop immediately.
    // (Blocking escapes stranded ships inside the Sun's heat zone.)
    const start = new Vec3(50_000, 0, 0); // inside captureRadius (120_000)
    const r = flyObstacle(start, beyondSun);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.pos.sub(beyondSun.position).length()).toBeCloseTo(beyondSun.captureRadius, 0);
  });

  it("starts inside the bubble heading DEEPER: drops immediately without moving", () => {
    const start = new Vec3(50_000, 0, 0);
    const inward: Body = { ...beyondSun, position: new Vec3(-500_000, 0, 0) };
    const r = lightspeedStep(start, Vec3.zero(), inward, NO_STEER, DT, P, obstacle);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(true);
    expect(r.pos.sub(start).length()).toBeCloseTo(0, 6);
  });

  it("a path just outside the bubble (graze) is not blocked — reaches the target normally", () => {
    const z = sun.captureRadius + 1000; // comfortably outside, still close
    const start = new Vec3(-500_000, 0, z);
    const grazeTarget: Body = { ...beyondSun, position: new Vec3(500_000, 0, z) };
    const r = flyObstacle(start, grazeTarget);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(false);
    const dist = r.pos.sub(grazeTarget.position).length();
    expect(dist).toBeCloseTo(grazeTarget.captureRadius, 0);
  });

  it("a path just inside the bubble radius is blocked (strictly-within boundary)", () => {
    const z = sun.captureRadius - 1000; // comfortably inside
    const start = new Vec3(-500_000, 0, z);
    const closeTarget: Body = { ...beyondSun, position: new Vec3(500_000, 0, z) };
    const r = flyObstacle(start, closeTarget);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(true);
  });

  it("target beyond the Sun: cruise ends well short of the target's own capture ring", () => {
    const start = new Vec3(-500_000, 0, 0);
    const r = flyObstacle(start, beyondSun);
    const distToTarget = r.pos.sub(beyondSun.position).length();
    expect(distToTarget).toBeGreaterThan(beyondSun.captureRadius * 5);
  });

  it("unrelated paths are byte-identical to no-obstacle flight (far-off obstacle never engages)", () => {
    const mars = findBody(bodies, "Mars");
    const farObstacle = { position: new Vec3(0, 0, 50_000_000), bubbleRadius: 100 };
    const withObstacle = fly(from("Earth"), mars); // uses lightspeedStep with no obstacle arg (unchanged call site)
    let p = from("Earth");
    let v = Vec3.zero();
    let t = 0;
    let done = false;
    for (let i = 0; i < 120 * 60 && !done; i++) {
      const r = lightspeedStep(p, v, mars, NO_STEER, DT, P, farObstacle);
      p = r.pos;
      v = r.vel;
      t += DT;
      done = r.done;
    }
    expect(done).toBe(true);
    expect(p.x).toBe(withObstacle.pos.x);
    expect(p.y).toBe(withObstacle.pos.y);
    expect(p.z).toBe(withObstacle.pos.z);
    expect(v.x).toBe(withObstacle.vel.x);
    expect(v.y).toBe(withObstacle.vel.y);
    expect(v.z).toBe(withObstacle.vel.z);
    expect(t).toBeCloseTo(withObstacle.t, 6);
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

  it("reports the body ahead when one is on the ray, null when the void is ahead", () => {
    const mars = findBody(bodies, "Mars");
    const start = mars.position.add(new Vec3(500_000, 0, 0));
    // Nose pointed straight at Mars: `ahead` names the body long before arrival.
    const toward = freeCruiseStep(start, new Vec3(-1, 0, 0).scale(1), new Vec3(-1, 0, 0), { x: 0, y: 0 }, dt, bodies);
    expect(toward.done).toBe(false);
    expect(toward.ahead).toBe("Mars");
    // Same spot, nose aimed wide of every bubble: nothing ahead — the void case.
    const away = freeCruiseStep(new Vec3(0, 1e9, 0), new Vec3(0, 1, 0), new Vec3(0, 1, 0), { x: 0, y: 0 }, dt, bodies);
    expect(away.done).toBe(false);
    expect(away.ahead).toBeNull();
  });
});

describe("cruising out from inside an obstacle bubble", () => {
  const sun = { position: new Vec3(0, 0, 0), bubbleRadius: 120_000 };
  const NO_STEER2 = { x: 0, y: 0 };
  const flyObs = (start: Vec3, target: { position: Vec3; captureRadius: number; radius: number }) => {
    let p = start.clone();
    let v = Vec3.zero();
    for (let i = 0; i < 120 * 60; i++) {
      const r = lightspeedStep(p, v, target, NO_STEER2, 1 / 60, DEFAULT_LS_PARAMS, sun);
      p = r.pos;
      v = r.vel;
      if (r.done) return { pos: p, vel: v, blocked: r.blocked ?? false, done: true };
    }
    return { pos: p, vel: v, blocked: false, done: false };
  };

  it("allows an outbound escape cruise started inside the bubble", () => {
    // 80km from the Sun (inside the 120km bubble), target dead ahead outward:
    // must fly the whole way and ARRIVE (not blocked).
    const target = { position: new Vec3(1_000_000, 0, 0), captureRadius: 12_000, radius: 2_000 };
    const r = flyObs(new Vec3(80_000, 0, 0), target);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.pos.sub(target.position).length()).toBeCloseTo(target.captureRadius, 0);
  });

  it("still drops immediately when heading deeper in", () => {
    const farTarget = { position: new Vec3(-1_000_000, 0, 0), captureRadius: 12_000, radius: 2_000 };
    const r = lightspeedStep(new Vec3(80_000, 0, 0), new Vec3(0, 0, 0), farTarget, NO_STEER2, 1 / 60, DEFAULT_LS_PARAMS, sun);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(true);
  });

  it("outside the bubble, a blocked chord still stops at the boundary", () => {
    const farTarget = { position: new Vec3(-1_000_000, 0, 0), captureRadius: 12_000, radius: 2_000 };
    const r = flyObs(new Vec3(500_000, 0, 0), farTarget);
    expect(r.done).toBe(true);
    expect(r.blocked).toBe(true);
    expect(r.pos.sub(sun.position).length()).toBeGreaterThanOrEqual(sun.bubbleRadius - 1);
  });
});
