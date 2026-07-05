import type { Body, BodyKind } from "../sim/Body";

// Schematic orrery, not a scale drawing: the Sun sits at the canvas centre,
// every body keeps its true bearing, but orbital radii are compressed with a
// power curve so Mercury doesn't vanish into the Sun's dot while Neptune sets
// the scale. Same trick every classroom solar-system poster uses.
export const MAP_RADIUS_GAMMA = 0.55;

// Moons orbit far too close to their planet to survive the compression —
// push them out to a fixed, clickable display distance along the true bearing.
export const MIN_MOON_SEP_PX = 24;

export interface MapPoint {
  name: string;
  kind: BodyKind;
  px: number;
  py: number;
}

export interface MapProjection {
  points: MapPoint[]; // same order as the bodies passed in
  rings: number[]; // display radius of each planet's orbit, inner to outer
  project(x: number, z: number): { px: number; py: number };
}

export function projectSystem(
  bodies: Body[],
  w: number,
  h: number,
  margin: number,
  moonSep: number = MIN_MOON_SEP_PX,
): MapProjection {
  const sun = bodies.find((b) => b.kind === "star")!;
  const planets = bodies.filter((b) => b.kind === "planet");
  const rMax = Math.max(
    ...planets.map((b) =>
      Math.hypot(b.position.x - sun.position.x, b.position.z - sun.position.z),
    ),
  );
  const rAvail = Math.min(w, h) / 2 - margin;
  const cx = w / 2;
  const cy = h / 2;

  const project = (x: number, z: number) => {
    const dx = x - sun.position.x;
    const dz = z - sun.position.z;
    const r = Math.hypot(dx, dz);
    if (r === 0) return { px: cx, py: cy };
    const rr = Math.min(1, r / rMax) ** MAP_RADIUS_GAMMA * rAvail;
    return { px: cx + (dx / r) * rr, py: cy + (dz / r) * rr };
  };

  const points: MapPoint[] = bodies.map((b) => ({
    name: b.name,
    kind: b.kind,
    ...project(b.position.x, b.position.z),
  }));

  // Re-seat each moon a readable distance from its planet.
  for (const p of points) {
    if (p.kind !== "moon") continue;
    const moon = bodies.find((b) => b.name === p.name)!;
    let anchor = planets[0];
    for (const pl of planets) {
      if (
        moon.position.sub(pl.position).length() < moon.position.sub(anchor.position).length()
      ) {
        anchor = pl;
      }
    }
    const ap = points.find((q) => q.name === anchor.name)!;
    if (Math.hypot(p.px - ap.px, p.py - ap.py) < moonSep) {
      const bx = moon.position.x - anchor.position.x;
      const bz = moon.position.z - anchor.position.z;
      const len = Math.hypot(bx, bz) || 1;
      p.px = ap.px + (bx / len) * moonSep;
      p.py = ap.py + (bz / len) * moonSep;
    }
  }

  const rings = planets.map((b) => {
    const q = project(b.position.x, b.position.z);
    return Math.hypot(q.px - cx, q.py - cy);
  });

  return { points, rings, project };
}
