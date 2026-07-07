// src/game/feel/chase.ts
import { Vec3 } from "../../sim/Vec3";

// Pure framing math for the chase camera: sit behind and above the ship,
// pull back with speed, and while slung switch to an orbit cam — camera on
// the planet–ship line outside the ship, aim locked on the planet, so the
// body you're circling stays dead-centre with the ship in the foreground.

export interface ChaseParams {
  baseDist: number; // m behind the ship
  speedDist: number; // extra pull-back at speed
  height: number; // m above the ship (along ship-up)
  lookAhead: number; // m ahead of the ship to aim at
  vRef: number; // m/s at which the speed pull-back saturates
  slingOrbitDist: number; // camera pull-back outside the ship, × body radius
  slingOrbitLift: number; // lift above the swing plane for a 3/4 view, × body radius
  groundAltRef: number; // m — below this altitude, ground framing blends in
  groundMinUp: number; // m — camera stays at least this far above the ship near ground
  surfaceMargin: number; // m — hard floor: camera never dips inside surface+margin
  posSmooth: number; // 1/s exponential smoothing rates
  lookSmooth: number;
  overheadScale: number; // landing view: camera height = altitude × this…
  overheadMin: number; // …clamped between these two (m)
  overheadMax: number;
  overheadSide: number; // m of lateral offset so the shot isn't perfectly concentric
}

export const DEFAULT_CHASE_PARAMS: ChaseParams = {
  baseDist: 35,
  speedDist: 20,
  height: 12,
  lookAhead: 20,
  vRef: 4_000,
  slingOrbitDist: 0.9,
  slingOrbitLift: 0.3,
  groundAltRef: 120,
  groundMinUp: 10,
  surfaceMargin: 4,
  posSmooth: 6,
  lookSmooth: 10,
  overheadScale: 1.0,
  overheadMin: 40,
  overheadMax: 220,
  overheadSide: 12,
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
  landing?: boolean; // descending to land: switch to the bird's-eye view
}

export interface ChaseFrame {
  camPos: Vec3;
  lookAt: Vec3;
  groundness: number; // 0 in space → 1 on the pad; callers blend camera-up with it
  overhead: number; // 1 in the landing bird's-eye view; callers re-aim camera-up
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
    // Orbit cam: planet dead-centre, ship in the foreground. The camera rides
    // the planet–ship line outside the ship (so the ship is always between
    // camera and planet) and lifts a little off the swing plane for depth.
    const rel = shipPos.sub(sling.center);
    const outward = rel.length() > 1e-6 ? rel.normalize() : up;
    camPos = shipPos
      .add(outward.scale(p.baseDist + sling.bodyRadius * p.slingOrbitDist))
      .add(sling.normal.scale(sling.bodyRadius * p.slingOrbitLift));
    lookAt = sling.center;
  }

  let groundness = 0;
  let overhead = 0;
  if (ground && ground.landing && !sling) {
    // Landing bird's-eye: hover above the ship along planet-up, aimed straight
    // down at it — the pad and touchdown point fill the frame as you descend.
    overhead = 1;
    const h = Math.max(p.overheadMin, Math.min(p.overheadMax, ground.altitude * p.overheadScale));
    // Small lateral offset (along the tangent-projected nose) keeps the shot
    // from being perfectly concentric and gives the up-vector a reference.
    const tangent = fwd.sub(ground.up.scale(fwd.dot(ground.up)));
    const side = tangent.length() > 1e-6 ? tangent.normalize() : orthogonalTo(ground.up);
    camPos = shipPos.add(ground.up.scale(h)).add(side.scale(p.overheadSide));
    lookAt = shipPos;
  }
  if (ground) {
    groundness = Math.max(0, Math.min(1, 1 - ground.altitude / p.groundAltRef));
    if (groundness > 0 && !overhead) {
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
  return { camPos, lookAt, groundness, overhead };
}

// Any unit vector perpendicular to v (for degenerate tangent fallbacks).
function orthogonalTo(v: Vec3): Vec3 {
  const ref = Math.abs(v.x) > 0.9 ? new Vec3(0, 0, 1) : new Vec3(1, 0, 0);
  return ref.sub(v.scale(ref.dot(v))).normalize();
}

// Exponential smoothing toward a target — frame-rate independent.
export function smoothToward(current: Vec3, target: Vec3, rate: number, dt: number): Vec3 {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return current.add(target.sub(current).scale(k));
}
