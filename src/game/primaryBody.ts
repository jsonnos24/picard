import { Vec3 } from "../sim/Vec3";
import { Body } from "../sim/Body";

export interface PrimaryBody {
  body: Body;
  altitude: number;
  up: Vec3;
}

export function selectPrimaryBody(position: Vec3, bodies: Body[]): PrimaryBody {
  let best: PrimaryBody | null = null;
  for (const body of bodies) {
    const toPos = position.sub(body.position);
    const dist = toPos.length();
    const altitude = dist - body.radius;
    if (best === null || altitude < best.altitude) {
      best = { body, altitude, up: dist === 0 ? new Vec3(0, 1, 0) : toPos.scale(1 / dist) };
    }
  }
  // bodies is never empty in this game, but satisfy the type:
  if (best === null) throw new Error("no bodies provided");
  return best;
}
