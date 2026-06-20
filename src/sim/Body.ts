import { Vec3 } from "./Vec3";
import { G, DISTANCE_SCALE } from "./constants";

export interface AtmosphereParams {
  seaLevelDensity: number; // kg/m^3
  scaleHeight: number; // m
}

export interface Body {
  name: string;
  mass: number; // kg
  radius: number; // m
  position: Vec3; // m, universe coords
  atmosphere: AtmosphereParams | null;
}

export const EARTH_MOON_REAL_DISTANCE = 3.844e8; // m

export function surfaceGravity(body: Body): number {
  return (G * body.mass) / (body.radius * body.radius);
}

export function createSolarSystem(): Body[] {
  const earth: Body = {
    name: "Earth",
    mass: 5.972e24,
    radius: 6.371e6,
    position: Vec3.zero(),
    atmosphere: { seaLevelDensity: 1.225, scaleHeight: 8500 },
  };
  const moon: Body = {
    name: "Moon",
    mass: 7.342e22,
    radius: 1.737e6,
    position: new Vec3(EARTH_MOON_REAL_DISTANCE * DISTANCE_SCALE, 0, 0),
    atmosphere: null,
  };
  return [earth, moon];
}
