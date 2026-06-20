import { Vec3 } from "./Vec3";

export interface FloatingOrigin {
  offset: Vec3;
  threshold: number;
}

export function createFloatingOrigin(threshold = 1e4): FloatingOrigin {
  return { offset: Vec3.zero(), threshold };
}

export function toRender(fo: FloatingOrigin, universePos: Vec3): Vec3 {
  return universePos.sub(fo.offset);
}

export function rebase(
  fo: FloatingOrigin,
  playerUniversePos: Vec3,
): FloatingOrigin {
  const renderPos = toRender(fo, playerUniversePos);
  if (renderPos.length() <= fo.threshold) return fo;
  return { ...fo, offset: playerUniversePos.clone() };
}
