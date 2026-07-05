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
  dist: number; // km from the anchor (Sun, unless `around` is set)
  angleDeg: number; // ecliptic (x/z) plane, 0° = +x, counterclockwise
  around?: string; // anchor body name; must appear earlier in SPECS
  color: number;
  landable?: boolean;
  rings?: { inner: number; outer: number };
}

// Hand-tuned toy scale: planets a few km across, hundreds of km apart, so a
// lightspeed hop is tens of seconds and every gravity bubble is a landmark
// you can see. Angles scatter the planets all around the Sun — a realistic
// orbital snapshot, so the Sun sits at the middle of the map, not one end.
const SPECS: BodySpec[] = [
  { name: "Sun", kind: "star", radius: 20_000, gSurf: 40, dist: 0, angleDeg: 0, color: 0xffcc33, landable: false },
  { name: "Mercury", kind: "planet", radius: 1_200, gSurf: 4, dist: 400, angleDeg: 35, color: 0xc9a27e },
  { name: "Venus", kind: "planet", radius: 2_600, gSurf: 9, dist: 680, angleDeg: 145, color: 0xf5a25d },
  { name: "Earth", kind: "planet", radius: 3_000, gSurf: 10, dist: 1000, angleDeg: -15, color: 0x3f9bff },
  { name: "Moon", kind: "moon", radius: 1_000, gSurf: 3, dist: 39, angleDeg: 40, around: "Earth", color: 0xbfc5cc },
  { name: "Mars", kind: "planet", radius: 2_000, gSurf: 6, dist: 1350, angleDeg: -60, color: 0xff6b4a },
  { name: "Jupiter", kind: "planet", radius: 9_000, gSurf: 22, dist: 1950, angleDeg: 60, color: 0xe8a15c },
  { name: "Saturn", kind: "planet", radius: 8_000, gSurf: 18, dist: 2550, angleDeg: -40, color: 0xf0cf8b, rings: { inner: 12_000, outer: 18_000 } },
  { name: "Uranus", kind: "planet", radius: 5_000, gSurf: 12, dist: 3150, angleDeg: 115, color: 0x7fd4e0 },
  { name: "Neptune", kind: "planet", radius: 5_000, gSurf: 14, dist: 3750, angleDeg: 255, color: 0x4f7bff },
];

export function createSolarSystem(): Body[] {
  const placed = new Map<string, Vec3>();
  return SPECS.map((s) => {
    const a = (s.angleDeg * Math.PI) / 180;
    const anchor = s.around ? placed.get(s.around)! : Vec3.zero();
    const position = anchor.add(
      new Vec3(Math.cos(a) * s.dist * 1000, 0, Math.sin(a) * s.dist * 1000),
    );
    placed.set(s.name, position);
    return {
      name: s.name,
      mass: massFor(s.gSurf, s.radius),
      radius: s.radius,
      position,
      atmosphere: null,
      kind: s.kind,
      landable: s.landable ?? true,
      captureRadius: s.radius * CAPTURE_RADIUS_FACTOR,
      color: s.color,
      ...(s.rings ? { rings: s.rings } : {}),
    };
  });
}

export function findBody(bodies: Body[], name: string): Body {
  const b = bodies.find((body) => body.name === name);
  if (!b) throw new Error(`Unknown body: ${name}`);
  return b;
}
