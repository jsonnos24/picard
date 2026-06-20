import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { Spacecraft } from "./Spacecraft";

// Warp drops the ship just above the descent threshold so the arrival is reachable
// in reasonable time. (5 radii ≈ 7000 km over the Moon took ~30+ min to descend.)
export const SAFE_APPROACH_RADII = 1.1;

export function safeApproachDistance(target: Body): number {
  return target.radius * SAFE_APPROACH_RADII;
}

export function warpTo(ship: Spacecraft, target: Body): Spacecraft {
  // Unit vector from target toward the ship's current position.
  const fromTarget = ship.position.sub(target.position).normalize();
  const dropPosition = target.position.add(
    fromTarget.scale(safeApproachDistance(target)),
  );
  const orientation = target.position.sub(dropPosition).normalize();
  return {
    ...ship,
    position: dropPosition,
    velocity: Vec3.zero(),
    orientation,
  };
}
