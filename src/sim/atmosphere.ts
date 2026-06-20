import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { Spacecraft, totalMass } from "./Spacecraft";

const DRAG_CD = 0.5;
const DRAG_AREA = 10; // m^2

export function airDensity(body: Body, altitude: number): number {
  if (!body.atmosphere) return 0;
  const h = Math.max(0, altitude);
  return body.atmosphere.seaLevelDensity * Math.exp(-h / body.atmosphere.scaleHeight);
}

export function dragAccel(s: Spacecraft, bodies: Body[]): Vec3 {
  const speed = s.velocity.length();
  if (speed === 0) return Vec3.zero();
  let acc = Vec3.zero();
  for (const body of bodies) {
    if (!body.atmosphere) continue;
    const altitude = s.position.sub(body.position).length() - body.radius;
    const rho = airDensity(body, altitude);
    if (rho === 0) continue;
    // drag force magnitude = ½ρv²·Cd·A ; acceleration opposes velocity
    const forceMag = 0.5 * rho * speed * speed * DRAG_CD * DRAG_AREA;
    const accelMag = forceMag / totalMass(s);
    acc = acc.add(s.velocity.normalize().scale(-accelMag));
  }
  return acc;
}
