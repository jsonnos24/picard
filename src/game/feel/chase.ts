// src/game/feel/chase.ts
import { Vec3 } from "../../sim/Vec3";

// Pure framing math for the chase camera: sit behind and above the ship,
// pull back with speed, and while slung bias out along the swing-plane normal
// so planet, ship, and fling direction all read in one shot.

export interface ChaseParams {
  baseDist: number; // m behind the ship
  speedDist: number; // extra pull-back at speed
  height: number; // m above the ship (along ship-up)
  lookAhead: number; // m ahead of the ship to aim at
  vRef: number; // m/s at which the speed pull-back saturates
  slingBias: number; // fraction of distance shifted along the swing normal
  slingWiden: number; // extra pull-back while slung, × body radius
  posSmooth: number; // 1/s exponential smoothing rates
  lookSmooth: number;
}

export const DEFAULT_CHASE_PARAMS: ChaseParams = {
  baseDist: 35,
  speedDist: 20,
  height: 12,
  lookAhead: 20,
  vRef: 4_000,
  slingBias: 0.6,
  slingWiden: 0.35,
  posSmooth: 6,
  lookSmooth: 10,
};

export interface SlingView {
  center: Vec3; // body center
  normal: Vec3; // swing-plane normal (unit)
  bodyRadius: number;
}

export interface ChaseFrame {
  camPos: Vec3;
  lookAt: Vec3;
}

export function chaseFrame(
  shipPos: Vec3,
  fwd: Vec3, // ship nose (unit)
  up: Vec3, // ship up (unit)
  speed: number,
  sling: SlingView | null,
  p: ChaseParams = DEFAULT_CHASE_PARAMS,
): ChaseFrame {
  const k = Math.min(1, Math.max(0, speed || 0) / p.vRef); // NaN-safe: treat as at-rest
  let dist = p.baseDist + p.speedDist * k;
  let camPos = shipPos.sub(fwd.scale(dist)).add(up.scale(p.height));
  let lookAt = shipPos.add(fwd.scale(p.lookAhead));

  if (sling) {
    dist += sling.bodyRadius * p.slingWiden;
    camPos = shipPos
      .sub(fwd.scale(dist))
      .add(sling.normal.scale(dist * p.slingBias))
      .add(up.scale(p.height));
    // Aim between the ship and the planet so both stay framed.
    lookAt = shipPos.add(sling.center.sub(shipPos).scale(0.25));
  }
  return { camPos, lookAt };
}

// Exponential smoothing toward a target — frame-rate independent.
export function smoothToward(current: Vec3, target: Vec3, rate: number, dt: number): Vec3 {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return current.add(target.sub(current).scale(k));
}
