import { describe, it, expect } from "vitest";
import {
  DEFAULT_SLING_PARAMS,
  SlingState,
  idleSling,
  tryCapture,
  stepSwing,
  releaseFling,
  tickSling,
  sunRepel,
} from "../../src/sim/slingshot";
import { createSolarSystem, findBody, Body } from "../../src/sim/Body";
import { Vec3 } from "../../src/sim/Vec3";

const P = DEFAULT_SLING_PARAMS;
const DT = 1 / 60;
const bodies = createSolarSystem();
const mars = findBody(bodies, "Mars");
const sun = findBody(bodies, "Sun");
const fallback = new Vec3(0, 0, 1);

// A ship crossing the edge of Mars's bubble, moving tangentially-ish inward.
function entryAt(body: Body, speed: number): { pos: Vec3; vel: Vec3 } {
  const pos = body.position.add(new Vec3(body.captureRadius - 1, 0, 0));
  const vel = new Vec3(-0.5, 0, 0.866).normalize().scale(speed);
  return { pos, vel };
}

function captured(speed = 4000): Extract<SlingState, { kind: "captured" }> {
  const { pos, vel } = entryAt(mars, speed);
  const s = tryCapture(idleSling(), pos, vel, mars, fallback, DT, P);
  expect(s.kind).toBe("captured");
  return s as Extract<SlingState, { kind: "captured" }>;
}

describe("tryCapture", () => {
  it("captures a fast ship crossing the bubble", () => {
    expect(captured().bodyName).toBe("Mars");
  });

  it("ignores a ship outside the bubble", () => {
    const pos = mars.position.add(new Vec3(mars.captureRadius * 2, 0, 0));
    const vel = new Vec3(0, 0, 4000);
    expect(tryCapture(idleSling(), pos, vel, mars, fallback, DT, P).kind).toBe("none");
  });

  it("ignores a slow ship (below vCaptureMin)", () => {
    const { pos, vel } = entryAt(mars, P.vCaptureMin - 1);
    expect(tryCapture(idleSling(), pos, vel, mars, fallback, DT, P).kind).toBe("none");
  });

  it("catches a fast crossing predictively (segment, not point)", () => {
    // One step at this speed tunnels 8 km — the segment must still hit the bubble.
    const speed = 500_000;
    const start = mars.position.add(new Vec3(mars.captureRadius + 1000, 0, 0));
    const vel = new Vec3(-1, 0, 0).scale(speed);
    const s = tryCapture(idleSling(), start, vel, mars, fallback, DT, P);
    expect(s.kind).toBe("captured");
  });

  it("never captures at the Sun", () => {
    const pos = sun.position.add(new Vec3(sun.captureRadius - 1, 0, 0));
    const vel = new Vec3(-4000, 0, 0);
    expect(tryCapture(idleSling(), pos, vel, sun, fallback, DT, P).kind).toBe("none");
  });

  it("does not re-capture while a release cooldown is ticking", () => {
    const { pos, vel } = entryAt(mars, 4000);
    const cooling: SlingState = { kind: "released", cooldown: 1 };
    expect(tryCapture(cooling, pos, vel, mars, fallback, DT, P)).toBe(cooling);
  });

  it("builds an orthonormal swing plane aligned with the entry motion", () => {
    const s = captured();
    expect(s.e1.length()).toBeCloseTo(1, 6);
    expect(s.e2.length()).toBeCloseTo(1, 6);
    expect(s.e1.dot(s.e2)).toBeCloseTo(0, 6);
    // e2 carries the tangential part of the entry velocity — never opposes it.
    const { vel } = entryAt(mars, 4000);
    expect(vel.normalize().dot(s.e2)).toBeGreaterThan(0);
  });

  it("resolves a dead-radial entry with the fallback tangent", () => {
    const pos = mars.position.add(new Vec3(mars.captureRadius - 1, 0, 0));
    const vel = new Vec3(-4000, 0, 0); // straight at the planet's center
    const s = tryCapture(idleSling(), pos, vel, mars, fallback, DT, P);
    expect(s.kind).toBe("captured");
    const c = s as Extract<SlingState, { kind: "captured" }>;
    expect(c.e1.dot(c.e2)).toBeCloseTo(0, 6);
    expect(c.e2.length()).toBeCloseTo(1, 6);
  });

  it("clamps the swing radius between rMin and rMax", () => {
    const s = captured();
    expect(s.radius).toBeGreaterThanOrEqual(P.rMinFactor * mars.radius);
    expect(s.radius).toBeLessThanOrEqual(P.rMaxFactor * mars.captureRadius);
  });
});

describe("stepSwing", () => {
  it("stays near the entry velocity at the moment of capture (blend)", () => {
    const s = captured();
    const { vel } = entryAt(mars, 4000);
    const step = stepSwing(s, mars, false, 0, DT, P);
    const drift = step.vel.sub(vel).length();
    expect(drift).toBeLessThan(vel.length() * 0.1);
  });

  it("converges onto the rail after blendTime", () => {
    let s: SlingState = captured();
    let pos = Vec3.zero();
    const steps = Math.ceil((P.blendTime / DT) * 2);
    for (let i = 0; i < steps; i++) {
      const r = stepSwing(s, mars, false, 0, DT, P);
      s = r.state;
      pos = r.pos;
    }
    const c = s as Extract<SlingState, { kind: "captured" }>;
    expect(pos.sub(mars.position).length()).toBeCloseTo(c.radius, 0);
  });

  it("winds up while held and reaches vSwingMax after enough loops", () => {
    let s: SlingState = captured();
    for (let i = 0; i < 60 * 5; i++) s = stepSwing(s, mars, true, 0, DT, P).state;
    const c = s as Extract<SlingState, { kind: "captured" }>;
    expect(c.speed).toBeCloseTo(P.vSwingMax, 0);
  });

  it("decays while not held but never below vCaptureMin", () => {
    let s: SlingState = captured(1000);
    for (let i = 0; i < 60 * 10; i++) s = stepSwing(s, mars, false, 0, DT, P).state;
    const c = s as Extract<SlingState, { kind: "captured" }>;
    expect(c.speed).toBeCloseTo(P.vCaptureMin, 0);
  });

  it("eases the radius toward the sweet spot", () => {
    let s: SlingState = captured();
    const before = (s as Extract<SlingState, { kind: "captured" }>).radius;
    const sweet = P.rSweetFactor * mars.radius;
    for (let i = 0; i < 60 * 5; i++) s = stepSwing(s, mars, true, 0, DT, P).state;
    const after = (s as Extract<SlingState, { kind: "captured" }>).radius;
    expect(Math.abs(after - sweet)).toBeLessThan(Math.abs(before - sweet));
  });

  it("keeps the ship on a circle around the body (post-blend)", () => {
    let s: SlingState = captured();
    let pos = Vec3.zero();
    for (let i = 0; i < 120; i++) {
      const r = stepSwing(s, mars, true, 0, DT, P);
      s = r.state;
      pos = r.pos;
    }
    const c = s as Extract<SlingState, { kind: "captured" }>;
    expect(pos.sub(mars.position).length()).toBeCloseTo(c.radius, 0);
  });

  it("steering tilts the swing plane while staying orthonormal", () => {
    let s: SlingState = captured();
    const before = (s as Extract<SlingState, { kind: "captured" }>).e1.clone();
    for (let i = 0; i < 60; i++) s = stepSwing(s, mars, false, 1, DT, P).state;
    const c = s as Extract<SlingState, { kind: "captured" }>;
    expect(c.e1.dot(c.e2)).toBeCloseTo(0, 5);
    expect(c.e1.length()).toBeCloseTo(1, 5);
    expect(c.e1.sub(before).length()).toBeGreaterThan(0.001);
  });
});

describe("releaseFling", () => {
  it("flings along the tangent at boosted speed", () => {
    let s: SlingState = captured();
    for (let i = 0; i < 120; i++) s = stepSwing(s, mars, true, 0, DT, P).state;
    const c = s as Extract<SlingState, { kind: "captured" }>;
    const fling = releaseFling(c, mars, null, P);
    expect(fling.velocity.length()).toBeCloseTo(c.speed * P.flingBoost, 3);
    // Direction is the analytic tangent: -sin(angle)·e1 + cos(angle)·e2.
    const tangent = c.e1
      .scale(-Math.sin(c.angle))
      .add(c.e2.scale(Math.cos(c.angle)))
      .normalize();
    expect(fling.velocity.normalize().dot(tangent)).toBeCloseTo(1, 6);
    expect(fling.snapped).toBe(false);
    expect(fling.state.kind).toBe("released");
  });

  it("snaps to the nav target inside the snap cone", () => {
    const c = captured();
    const tangent = c.e1
      .scale(-Math.sin(c.angle))
      .add(c.e2.scale(Math.cos(c.angle)))
      .normalize();
    // A target direction 5° off the tangent — inside the ~10° cone.
    const off = tangent.add(c.e1.scale(Math.tan(0.087))).normalize();
    const fling = releaseFling(c, mars, off, P);
    expect(fling.snapped).toBe(true);
    expect(fling.velocity.normalize().dot(off)).toBeCloseTo(1, 6);
  });

  it("does not snap outside the snap cone", () => {
    const c = captured();
    const fling = releaseFling(c, mars, c.e1, P); // radial — ~90° off the tangent
    expect(fling.snapped).toBe(false);
  });
});

describe("tickSling", () => {
  it("counts the release cooldown down to none", () => {
    let s: SlingState = { kind: "released", cooldown: 0.1 };
    for (let i = 0; i < 12; i++) s = tickSling(s, DT);
    expect(s.kind).toBe("none");
  });

  it("leaves other states alone", () => {
    const s = idleSling();
    expect(tickSling(s, DT)).toBe(s);
  });
});

describe("chained arrival (lightspeed handoff invariant)", () => {
  it("a 4 km/s arrival at the bubble edge captures, winds up, and flings faster than it arrived", () => {
    const arriveSpeed = 4000;
    let s: SlingState = captured(arriveSpeed);
    for (let i = 0; i < 60 * 2; i++) s = stepSwing(s, mars, true, 0, DT, P).state;
    const c = s as Extract<SlingState, { kind: "captured" }>;
    const fling = releaseFling(c, mars, null, P);
    expect(fling.velocity.length()).toBeGreaterThan(arriveSpeed);
  });
});

describe("sunRepel", () => {
  it("pushes outward, stronger deeper in the bubble", () => {
    const shallow = sun.position.add(new Vec3(sun.captureRadius * 0.9, 0, 0));
    const deep = sun.position.add(new Vec3(sun.radius * 1.5, 0, 0));
    const aShallow = sunRepel(shallow, sun);
    const aDeep = sunRepel(deep, sun);
    expect(aShallow.x).toBeGreaterThan(0); // outward = +x here
    expect(aDeep.length()).toBeGreaterThan(aShallow.length());
  });

  it("is zero outside the bubble", () => {
    const outside = sun.position.add(new Vec3(sun.captureRadius + 1, 0, 0));
    expect(sunRepel(outside, sun).length()).toBe(0);
  });
});
