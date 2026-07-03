import { Vec3 } from "./Vec3";
import { G } from "./constants";

export interface AtmosphereParams {
  seaLevelDensity: number; // kg/m^3
  scaleHeight: number; // m
}

export type BodyKind = "star" | "planet" | "moon";

export interface Body {
  name: string;
  mass: number; // kg — derived from the desired surface gravity, not real values
  radius: number; // m
  position: Vec3; // m, universe coords
  atmosphere: AtmosphereParams | null;
  kind: BodyKind;
  landable: boolean;
  captureRadius: number; // m — the visible gravity bubble / slingshot capture range
  color: number; // render hint (hex)
  rings?: { inner: number; outer: number }; // m — Saturn
}

// The gravity bubble extends this many radii from each body's center.
export const CAPTURE_RADIUS_FACTOR = 6;

export function surfaceGravity(body: Body): number {
  return (G * body.mass) / (body.radius * body.radius);
}

// Mass that produces the wanted surface gravity at the toy radius, so the
// physical G and every gravity-derived formula keep working unchanged.
function massFor(gSurf: number, radius: number): number {
  return (gSurf * radius * radius) / G;
}

interface BodySpec {
  name: string;
  kind: BodyKind;
  radius: number; // m
  gSurf: number; // m/s^2
  x: number; // km from Sun, ecliptic (x/z) plane
  z: number; // km
  color: number;
  landable?: boolean;
  rings?: { inner: number; outer: number };
}

// Hand-tuned toy scale: planets a few km across, hundreds of km apart, so a
// lightspeed hop is ~30 s and every gravity bubble is a landmark you can see.
const SPECS: BodySpec[] = [
  { name: "Sun", kind: "star", radius: 20_000, gSurf: 40, x: 0, z: 0, color: 0xffcc33, landable: false },
  { name: "Mercury", kind: "planet", radius: 1_200, gSurf: 4, x: 400, z: 60, color: 0xc9a27e },
  { name: "Venus", kind: "planet", radius: 2_600, gSurf: 9, x: 680, z: -120, color: 0xf5a25d },
  { name: "Earth", kind: "planet", radius: 3_000, gSurf: 10, x: 1000, z: 80, color: 0x3f9bff },
  { name: "Moon", kind: "moon", radius: 1_000, gSurf: 3, x: 1030, z: 105, color: 0xbfc5cc },
  { name: "Mars", kind: "planet", radius: 2_000, gSurf: 6, x: 1350, z: -150, color: 0xff6b4a },
  { name: "Jupiter", kind: "planet", radius: 9_000, gSurf: 22, x: 1950, z: 200, color: 0xe8a15c },
  { name: "Saturn", kind: "planet", radius: 8_000, gSurf: 18, x: 2550, z: -220, color: 0xf0cf8b, rings: { inner: 12_000, outer: 18_000 } },
  { name: "Uranus", kind: "planet", radius: 5_000, gSurf: 12, x: 3150, z: 120, color: 0x7fd4e0 },
  { name: "Neptune", kind: "planet", radius: 5_000, gSurf: 14, x: 3750, z: -80, color: 0x4f7bff },
];

export function createSolarSystem(): Body[] {
  return SPECS.map((s) => ({
    name: s.name,
    mass: massFor(s.gSurf, s.radius),
    radius: s.radius,
    position: new Vec3(s.x * 1000, 0, s.z * 1000),
    atmosphere: null,
    kind: s.kind,
    landable: s.landable ?? true,
    captureRadius: s.radius * CAPTURE_RADIUS_FACTOR,
    color: s.color,
    ...(s.rings ? { rings: s.rings } : {}),
  }));
}

export function findBody(bodies: Body[], name: string): Body {
  const b = bodies.find((body) => body.name === name);
  if (!b) throw new Error(`Unknown body: ${name}`);
  return b;
}
