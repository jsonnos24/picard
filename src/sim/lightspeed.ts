import { Vec3, rotateAboutAxis } from "./Vec3";

// Lightspeed is real flight, not a teleport: a trapezoid speed profile toward
// the nav target that always hands the ship off at the target's capture ring
// moving inward at vArrive — exactly the entry speed the slingshot wants.

export interface LsParams {
  aAccel: number; // m/s²
  aBrake: number; // m/s²
  vMax: number; // m/s
  vArrive: number; // m/s — speed at the capture-ring handoff
  vDrift: number; // m/s — speed a cancelled cruise bleeds down to (landable)
  steerMax: number; // rad — how far mid-cruise steering can deflect the path
  flybyRadiusFactor: number; // arrival aims this many radii off-center (sling entry)
}

export const DEFAULT_LS_PARAMS: LsParams = {
  aAccel: 5_000,
  aBrake: 12_000,
  vMax: 150_000,
  vArrive: 4_000,
  vDrift: 300,
  steerMax: 0.18,
  flybyRadiusFactor: 2.5,
};

export interface LsTarget {
  position: Vec3;
  radius: number;
  captureRadius: number;
}

export interface LsStepResult {
  pos: Vec3;
  vel: Vec3;
  done: boolean; // cruise ended — hand off to capture/descent (arrival) or resume normal flight (obstacle)
  blocked?: boolean; // true only when `done` fired because an obstacle blocked the path, not an arrival
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

// An obstacle guided cruise must not tunnel through — today only the Sun
// (Game passes its center + captureRadius, the same bubble sunRepel uses).
// free-cruise already stops at any body's bubble because the Sun is just
// another entry in its obstacle list; guided cruise flies a straight
// trapezoid to a specific target and had no such check at all.
export interface LsObstacle {
  position: Vec3;
  bubbleRadius: number;
}

// Point-segment(ish) check: does the straight ray from `pos` toward `dirTo`
// enter the obstacle's bubble before `maxDist` (the target's own drop
// point)? Returns the distance to the entry boundary, or null if the path
// never gets there (misses the bubble, only grazes its edge, the bubble is
// behind us, or it lies beyond the target we're already aiming to reach).
function obstacleEntryDistance(
  pos: Vec3,
  dirTo: Vec3,
  maxDist: number,
  obstacle: LsObstacle,
): number | null {
  const toObs = obstacle.position.sub(pos);
  const distC = toObs.length();
  if (distC <= obstacle.bubbleRadius) return 0; // already inside — drop immediately
  const proj = toObs.dot(dirTo);
  if (proj <= 0) return null; // obstacle is behind us
  const perp2 = distC * distC - proj * proj;
  const R2 = obstacle.bubbleRadius * obstacle.bubbleRadius;
  if (perp2 >= R2) return null; // ray misses the bubble, or only grazes its edge (tangent)
  const s = proj - Math.sqrt(R2 - perp2);
  if (s < 0 || s >= maxDist) return null; // entry is behind us, or beyond the target's drop point
  return s;
}

export function lightspeedStep(
  pos: Vec3,
  vel: Vec3,
  target: LsTarget,
  steer: { x: number; y: number }, // -1..1 each
  dt: number,
  p: LsParams = DEFAULT_LS_PARAMS,
  obstacle?: LsObstacle,
): LsStepResult {
  const toTarget = target.position.sub(pos);
  const distToDrop = toTarget.length() - target.captureRadius;
  const dirTo = toTarget.normalize();

  const blockDist = obstacle
    ? obstacleEntryDistance(pos, dirTo, Math.max(0, distToDrop), obstacle)
    : null;

  if (blockDist !== null) {
    // The straight path to the target would tunnel through the obstacle's
    // bubble first: brake toward the near boundary exactly like an arrival,
    // but hand off straight ahead (no flyby aim) — there's nothing to
    // capture here, this is an abort. Gravity, the repel force, and the HUD
    // heat warning take over from here; the caller (Game) must not treat
    // this as an arrival (see LsStepResult.blocked).
    const vDes = Math.min(
      p.vMax,
      Math.sqrt(p.vArrive * p.vArrive + 2 * p.aBrake * blockDist),
    );
    const speedNow = vel.length();
    const speed =
      speedNow < vDes
        ? Math.min(vDes, speedNow + p.aAccel * dt)
        : Math.max(vDes, speedNow - p.aBrake * dt);
    if (blockDist <= speed * dt) {
      return { pos: pos.add(dirTo.scale(blockDist)), vel: dirTo.scale(p.vArrive), done: true, blocked: true };
    }
    return { pos: pos.add(dirTo.scale(speed * dt)), vel: dirTo.scale(speed), done: false };
  }

  // Trapezoid profile on the remaining distance: never faster than what aBrake
  // can shed down to vArrive by the ring.
  const vDes = Math.min(
    p.vMax,
    Math.sqrt(p.vArrive * p.vArrive + 2 * p.aBrake * Math.max(0, distToDrop)),
  );
  const speedNow = vel.length();
  const speed =
    speedNow < vDes
      ? Math.min(vDes, speedNow + p.aAccel * dt)
      : Math.max(vDes, speedNow - p.aBrake * dt);

  // Predictive drop: if this step would carry us past the ring, clamp onto it.
  // The handoff velocity aims at a flyby point offset from the body's center:
  // a tangential-rich slingshot entry, and a safe whiff-past without a capture
  // (a dead-center arrival at vArrive could never be braked at toy scale).
  if (distToDrop <= speed * dt) {
    const dropPos = pos.add(dirTo.scale(Math.max(0, distToDrop)));
    const ref = Math.abs(dirTo.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const side = dirTo.cross(ref).normalize();
    const offset = Math.min(p.flybyRadiusFactor * target.radius, 0.7 * target.captureRadius);
    const flybyPoint = target.position.add(side.scale(offset));
    return {
      pos: dropPos,
      vel: flybyPoint.sub(dropPos).normalize().scale(p.vArrive),
      done: true,
    };
  }

  // Small mid-cruise steering: deflect the flight direction around the to-target
  // axis so the drop point (and the slingshot entry) can be nudged.
  let dir = dirTo;
  const sx = clamp1(steer.x) * p.steerMax;
  const sy = clamp1(steer.y) * p.steerMax;
  if (sx !== 0 || sy !== 0) {
    const ref = Math.abs(dirTo.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const right = dirTo.cross(ref).normalize();
    const up = right.cross(dirTo).normalize();
    dir = rotateAboutAxis(rotateAboutAxis(dirTo, up, sx), right, sy).normalize();
  }

  return { pos: pos.add(dir.scale(speed * dt)), vel: dir.scale(speed), done: false };
}

export interface FreeObstacle {
  name: string;
  position: Vec3;
  radius: number;
  captureRadius: number;
}

export interface FreeStepResult {
  pos: Vec3;
  vel: Vec3;
  dir: Vec3; // persistent nose direction (steering bends it)
  done: boolean; // flew into a gravity bubble — hand off to capture
  bodyName: string | null; // whose bubble ended the cruise
}

// Point-and-fly: no destination, just the nose. Scan the flight ray for the
// nearest gravity bubble it actually enters; brake toward that entry point
// with the same trapezoid as guided flight and hand off at the ring exactly
// like a guided arrival (flyby offset, vArrive, inbound). Bubbles the ray
// misses are flown straight past; the bubble the ship starts inside is being
// left, not arrived at.
export function freeCruiseStep(
  pos: Vec3,
  vel: Vec3,
  dir: Vec3,
  steer: { x: number; y: number },
  dt: number,
  obstacles: FreeObstacle[],
  p: LsParams = DEFAULT_LS_PARAMS,
): FreeStepResult {
  let d = dir.normalize();
  const sx = clamp1(steer.x) * p.steerMax * dt;
  const sy = clamp1(steer.y) * p.steerMax * dt;
  if (sx !== 0 || sy !== 0) {
    const ref = Math.abs(d.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const right = d.cross(ref).normalize();
    const up = right.cross(d).normalize();
    d = rotateAboutAxis(rotateAboutAxis(d, up, sx), right, sy).normalize();
  }

  let bestS = Infinity;
  let bestBody: FreeObstacle | null = null;
  for (const b of obstacles) {
    const to = b.position.sub(pos);
    const distC = to.length();
    if (distC <= b.captureRadius) continue; // already inside: leaving it
    const proj = to.dot(d);
    if (proj <= 0) continue; // behind the nose
    const perp2 = distC * distC - proj * proj;
    const R2 = b.captureRadius * b.captureRadius;
    if (perp2 >= R2) continue; // ray misses the bubble
    const s = proj - Math.sqrt(R2 - perp2); // distance to bubble entry
    if (s < bestS) {
      bestS = s;
      bestBody = b;
    }
  }

  const vDes = bestBody
    ? Math.min(p.vMax, Math.sqrt(p.vArrive * p.vArrive + 2 * p.aBrake * Math.max(0, bestS)))
    : p.vMax;
  const speedNow = vel.length();
  const speed =
    speedNow < vDes
      ? Math.min(vDes, speedNow + p.aAccel * dt)
      : Math.max(vDes, speedNow - p.aBrake * dt);

  if (bestBody && bestS <= speed * dt) {
    // Same handoff as a guided arrival: on the ring, aimed at a flyby point.
    const dropPos = pos.add(d.scale(bestS));
    const dirTo = bestBody.position.sub(dropPos).normalize();
    const ref = Math.abs(dirTo.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const side = dirTo.cross(ref).normalize();
    const offset = Math.min(p.flybyRadiusFactor * bestBody.radius, 0.7 * bestBody.captureRadius);
    const flybyPoint = bestBody.position.add(side.scale(offset));
    return {
      pos: dropPos,
      vel: flybyPoint.sub(dropPos).normalize().scale(p.vArrive),
      dir: d,
      done: true,
      bodyName: bestBody.name,
    };
  }

  return { pos: pos.add(d.scale(speed * dt)), vel: d.scale(speed), dir: d, done: false, bodyName: null };
}

// Cancelling mid-cruise: bleed speed down to vDrift so the player is left
// drifting at a pace the landing assist can actually arrest.
export function brakeStep(
  vel: Vec3,
  dt: number,
  p: LsParams = DEFAULT_LS_PARAMS,
): { vel: Vec3; done: boolean } {
  const speed = vel.length();
  if (speed <= p.vDrift) return { vel, done: true };
  const next = Math.max(p.vDrift, speed - p.aBrake * dt);
  return { vel: vel.normalize().scale(next), done: next <= p.vDrift };
}

// Closed-form trip-time estimate for the HUD: accelerate to a peak, cruise,
// brake to vArrive over the remaining distance.
export function etaSeconds(
  distToDrop: number,
  speed: number,
  p: LsParams = DEFAULT_LS_PARAMS,
): number {
  if (distToDrop <= 0) return 0;
  const num =
    distToDrop + (speed * speed) / (2 * p.aAccel) + (p.vArrive * p.vArrive) / (2 * p.aBrake);
  const vPeak = Math.min(p.vMax, Math.sqrt(num / (1 / (2 * p.aAccel) + 1 / (2 * p.aBrake))));
  if (vPeak <= speed) return Math.max(0, (speed - p.vArrive) / p.aBrake);
  const dAcc = (vPeak * vPeak - speed * speed) / (2 * p.aAccel);
  const dBrake = (vPeak * vPeak - p.vArrive * p.vArrive) / (2 * p.aBrake);
  const dCruise = Math.max(0, distToDrop - dAcc - dBrake);
  return (vPeak - speed) / p.aAccel + (vPeak - p.vArrive) / p.aBrake + dCruise / vPeak;
}
