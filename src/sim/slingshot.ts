import { Vec3, rotateAboutAxis } from "./Vec3";
import { Body } from "./Body";

// Gravity-bubble slingshot: flying into a body's capture radius at speed hooks
// the ship onto an analytic circular rail around it (toy gravity is far too
// weak to bend a km/s ship, and a rail makes release timing legible). Hold to
// wind the swing up like a hammer throw; release to fling along the tangent.

export interface SlingParams {
  vCaptureMin: number; // m/s — slower than this and the bubble ignores you
  rMinFactor: number; // swing radius floor, × body.radius (never clips surface)
  rMaxFactor: number; // swing radius ceiling, × captureRadius
  rSweetFactor: number; // eased-toward swing radius, × body.radius
  radiusEaseRate: number; // 1/s — fraction of remaining gap closed per second
  vSwingMax: number; // m/s
  swingAccel: number; // m/s² while held — the wind-up
  swingDecay: number; // m/s² while not held
  flingBoost: number; // release speed multiplier
  blendTime: number; // s — ease from free flight onto the rail
  snapCone: number; // rad — release snaps to the nav target inside this
  tiltRate: number; // rad/s of swing-plane tilt at full steer
  cooldown: number; // s after release before the next capture
}

export const DEFAULT_SLING_PARAMS: SlingParams = {
  vCaptureMin: 300,
  rMinFactor: 1.6,
  rMaxFactor: 0.85,
  rSweetFactor: 2.5,
  radiusEaseRate: 0.1,
  vSwingMax: 6_000,
  swingAccel: 900,
  swingDecay: 250,
  flingBoost: 1.5,
  blendTime: 0.4,
  snapCone: 0.17,
  tiltRate: 0.5,
  cooldown: 1.5,
};

export type SlingState =
  | { kind: "none" }
  | {
      kind: "captured";
      bodyName: string;
      e1: Vec3; // orthonormal basis of the swing plane; entry direction
      e2: Vec3; // tangential at entry, aligned with the entry velocity
      radius: number;
      angle: number; // polar angle in the (e1, e2) plane
      speed: number; // tangential, m/s
      blend: number; // 0→1 over blendTime
      entryPos: Vec3;
      entryVel: Vec3;
    }
  | { kind: "released"; cooldown: number };

export function idleSling(): SlingState {
  return { kind: "none" };
}

function distanceToSegment(center: Vec3, a: Vec3, b: Vec3): number {
  const ab = b.sub(a);
  const lenSq = ab.lengthSq();
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, center.sub(a).dot(ab) / lenSq));
  return a.add(ab.scale(t)).sub(center).length();
}

// Capture fires when the ship's path this step touches the bubble at speed.
// `fallbackTangent` (e.g. camera right) resolves a dead-radial entry, where
// r × v is degenerate and no swing plane exists.
export function tryCapture(
  state: SlingState,
  pos: Vec3,
  vel: Vec3,
  body: Body,
  fallbackTangent: Vec3,
  dt: number,
  p: SlingParams = DEFAULT_SLING_PARAMS,
): SlingState {
  if (state.kind !== "none") return state;
  if (!body.landable) return state; // the Sun repels instead
  const speed = vel.length();
  if (speed < p.vCaptureMin) return state;
  const crosses =
    distanceToSegment(body.position, pos, pos.add(vel.scale(dt))) <= body.captureRadius;
  if (!crosses) return state;

  const r = pos.sub(body.position);
  const rHat = r.normalize();
  let vHat = vel.normalize();
  if (rHat.cross(vHat).length() < 0.05) vHat = fallbackTangent.normalize();
  const n = rHat.cross(vHat).normalize();
  const e1 = rHat;
  const e2 = n.cross(e1).normalize(); // tangential component of the entry velocity

  const radius = Math.max(
    p.rMinFactor * body.radius,
    Math.min(r.length(), p.rMaxFactor * body.captureRadius),
  );
  return {
    kind: "captured",
    bodyName: body.name,
    e1,
    e2,
    radius,
    angle: 0,
    speed: Math.min(speed, p.vSwingMax),
    blend: 0,
    entryPos: pos.clone(),
    entryVel: vel.clone(),
  };
}

export interface SwingStep {
  state: SlingState;
  pos: Vec3;
  vel: Vec3;
}

function railPose(
  s: Extract<SlingState, { kind: "captured" }>,
  center: Vec3,
): { pos: Vec3; vel: Vec3 } {
  const cos = Math.cos(s.angle);
  const sin = Math.sin(s.angle);
  const pos = center.add(s.e1.scale(cos * s.radius)).add(s.e2.scale(sin * s.radius));
  const tangent = s.e1.scale(-sin).add(s.e2.scale(cos));
  return { pos, vel: tangent.scale(s.speed) };
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function stepSwing(
  state: SlingState,
  body: Body,
  held: boolean,
  steer: number, // -1..1, tilts the swing plane about the current tangent
  dt: number,
  p: SlingParams = DEFAULT_SLING_PARAMS,
): SwingStep {
  if (state.kind !== "captured") {
    throw new Error("stepSwing requires a captured state");
  }
  let { e1, e2, radius, angle, speed, blend } = state;

  const accel = held ? p.swingAccel : -p.swingDecay;
  speed = Math.max(p.vCaptureMin, Math.min(p.vSwingMax, speed + accel * dt));
  radius += (p.rSweetFactor * body.radius - radius) * Math.min(1, p.radiusEaseRate * dt);
  angle += (speed / radius) * dt;

  if (steer !== 0) {
    const tangent = e1.scale(-Math.sin(angle)).add(e2.scale(Math.cos(angle))).normalize();
    const tilt = steer * p.tiltRate * dt;
    e1 = rotateAboutAxis(e1, tangent, tilt);
    e2 = rotateAboutAxis(e2, tangent, tilt);
  }

  blend = Math.min(1, blend + dt / p.blendTime);
  const next: SlingState = { ...state, e1, e2, radius, angle, speed, blend };
  const rail = railPose(next as Extract<SlingState, { kind: "captured" }>, body.position);

  if (blend < 1) {
    // Ease from where free flight would have carried us onto the rail.
    const elapsed = blend * p.blendTime;
    const free = state.entryPos.add(state.entryVel.scale(elapsed));
    const k = smoothstep(blend);
    return {
      state: next,
      pos: free.add(rail.pos.sub(free).scale(k)),
      vel: state.entryVel.add(rail.vel.sub(state.entryVel).scale(k)),
    };
  }
  return { state: next, pos: rail.pos, vel: rail.vel };
}

export interface Fling {
  state: SlingState;
  velocity: Vec3;
  snapped: boolean; // release aligned with the nav target — the perfect release
}

export function releaseFling(
  state: SlingState,
  body: Body,
  toTarget: Vec3 | null, // unit-agnostic direction toward the nav target, or null
  p: SlingParams = DEFAULT_SLING_PARAMS,
): Fling {
  if (state.kind !== "captured") {
    throw new Error("releaseFling requires a captured state");
  }
  const { vel } = railPose(state, body.position);
  let dir = vel.normalize();
  let snapped = false;
  if (toTarget) {
    const want = toTarget.normalize();
    const misalign = Math.acos(Math.max(-1, Math.min(1, dir.dot(want))));
    if (misalign <= p.snapCone) {
      dir = want;
      snapped = true;
    }
  }
  return {
    state: { kind: "released", cooldown: p.cooldown },
    velocity: dir.scale(state.speed * p.flingBoost),
    snapped,
  };
}

export function tickSling(state: SlingState, dt: number): SlingState {
  if (state.kind !== "released") return state;
  const cooldown = state.cooldown - dt;
  return cooldown <= 0 ? { kind: "none" } : { kind: "released", cooldown };
}

// The Sun never captures — it shoves. Outward acceleration ramping linearly
// from 0 at the bubble edge to `strength` at the surface.
export const SUN_REPEL_STRENGTH = 60; // m/s²

export function sunRepel(pos: Vec3, sun: Body, strength = SUN_REPEL_STRENGTH): Vec3 {
  const r = pos.sub(sun.position);
  const dist = r.length();
  if (dist >= sun.captureRadius || dist === 0) return Vec3.zero();
  const depth = 1 - (dist - sun.radius) / (sun.captureRadius - sun.radius);
  return r.normalize().scale(strength * Math.max(0, Math.min(1, depth)));
}
