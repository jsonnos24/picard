import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { G } from "./constants";

export function gravityAccel(position: Vec3, bodies: Body[]): Vec3 {
  let acc = Vec3.zero();
  for (const body of bodies) {
    const delta = body.position.sub(position); // toward the body
    const distSq = delta.lengthSq();
    if (distSq === 0) continue;
    const dist = Math.sqrt(distSq);
    const magnitude = (G * body.mass) / distSq;
    acc = acc.add(delta.scale(magnitude / dist)); // delta/dist = unit vector
  }
  return acc;
}
