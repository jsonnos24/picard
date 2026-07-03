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
  groundAltRef: number; // m — below this altitude, ground framing blends in
  groundMinUp: number; // m — camera stays at least this far above the ship near ground
  surfaceMargin: number; // m — hard floor: camera never dips inside surface+margin
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
  groundAltRef: 120,
  groundMinUp: 10,
  surfaceMargin: 4,
  posSmooth: 6,
  lookSmooth: 10,
};

export interface SlingView {
  center: Vec3; // body center
  normal: Vec3; // swing-plane normal (unit)
  bodyRadius: number;
}

// The primary body under the ship, for ground-aware framing: a nose-up rocket
// on a pad would otherwise put "behind the ship" underground.
export interface GroundView {
  center: Vec3;
  radius: number;
  up: Vec3; // local planet-up at the ship (unit)
  altitude: number; // m above the surface
}

export interface ChaseFrame {
  camPos: Vec3;
  lookAt: Vec3;
  groundness: number; // 0 in space → 1 on the pad; callers blend camera-up with it
}

export function chaseFrame(
  shipPos: Vec3,
  fwd: Vec3, // ship nose (unit)
  up: Vec3, // ship up (unit)
  speed: number,
  sling: SlingView | null,
  ground: GroundView | null,
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

  let groundness = 0;
  if (ground) {
    groundness = Math.max(0, Math.min(1, 1 - ground.altitude / p.groundAltRef));
    if (groundness > 0) {
      // Lift the camera so it never frames the ship from below the horizon,
      // and pull the aim point down toward the ship so the rocket stays framed.
      const off = camPos.sub(shipPos);
      const upComp = off.dot(ground.up);
      const minUp = p.groundMinUp * groundness;
      if (upComp < minUp) camPos = camPos.add(ground.up.scale(minUp - upComp));
      lookAt = shipPos.add(fwd.scale(p.lookAhead * (1 - 0.7 * groundness)));
    }
    // Hard floor regardless of framing: never inside the planet.
    const rel = camPos.sub(ground.center);
    const minR = ground.radius + p.surfaceMargin;
    if (rel.length() < minR) camPos = ground.center.add(rel.normalize().scale(minR));
  }
  return { camPos, lookAt, groundness };
}

// Exponential smoothing toward a target — frame-rate independent.
export function smoothToward(current: Vec3, target: Vec3, rate: number, dt: number): Vec3 {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return current.add(target.sub(current).scale(k));
}
