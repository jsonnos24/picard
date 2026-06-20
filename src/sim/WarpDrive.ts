import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { Spacecraft } from "./Spacecraft";

export const SAFE_APPROACH_RADII = 5;

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
