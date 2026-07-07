// src/game/feel/starfieldSpec.ts
// Pure data generation for the starfield: sizes, tints, twinkle, and the
// milky-way band scatter. Zero Three.js imports — render/scene/bodies.ts
// turns this into geometry/shader attributes. Seeded via mulberry32
// (prng.ts) so the sky is identical across runs and exactly testable.

import { prng } from "./prng";

// Four flat tints — no photoreal gradients, just a cartoon palette. Faint is
// reserved mostly for small stars (see TINT_WEIGHTS below).
export const STAR_TINTS: readonly string[] = [
  "#ffffff", // white
  "#ffe9c4", // warm
  "#cfe0ff", // cool
  "#8fa3c0", // faint
];

const TWO_PI = Math.PI * 2;

export interface StarField {
  positions: Float32Array; // unit vectors, xyz * n — caller scales by radius
  sizes: Float32Array; // relative size, ~1.0-4.0
  colorIndex: Uint8Array; // index into STAR_TINTS
  twinklePhase: Float32Array; // [0, 2*PI)
  twinkleAmp: Float32Array; // 0 for small stars; 0.25-0.5 for medium/large
}

type SizeClass = "small" | "medium" | "large";

const SIZE_RANGES: Record<SizeClass, [number, number]> = {
  small: [1.0, 1.6],
  medium: [1.6, 2.6],
  large: [2.6, 4.0],
};

// Cumulative thresholds: 85% small, 12% medium, 3% large.
function pickSizeClass(u: number): SizeClass {
  if (u < 0.85) return "small";
  if (u < 0.97) return "medium";
  return "large";
}

// Tint weights per size class (white, warm, cool, faint) — faint is reserved
// mostly for small stars; medium/large skew brighter (white/warm/cool only).
const TINT_WEIGHTS: Record<SizeClass, readonly number[]> = {
  small: [0.35, 0.2, 0.15, 0.3],
  medium: [0.45, 0.3, 0.25, 0.0],
  large: [0.5, 0.3, 0.2, 0.0],
};

// Band stars (dust lane) skew toward faint/warm rather than crisp white/cool.
const BAND_TINT_WEIGHTS: readonly number[] = [0.15, 0.35, 0.05, 0.45];

function pickTintIndex(u: number, weights: readonly number[]): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (u < acc) return i;
  }
  return weights.length - 1;
}

type Vec3Tuple = [number, number, number];

function randomUnitVector(rng: () => number): Vec3Tuple {
  const z = rng() * 2 - 1;
  const theta = rng() * TWO_PI;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [Math.cos(theta) * r, Math.sin(theta) * r, z];
}

// Box-Muller: a standard normal sample from two uniforms. u1 is clamped away
// from 0 so log() never sees -Infinity (mulberry32 can, in principle, emit
// exactly 0).
function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);
}

/**
 * An orthonormal basis {u, v} spanning the plane perpendicular to unit
 * vector `n`. Exported so render glue can place things (e.g. nebula sprites)
 * in the same band plane generateBand scatters around.
 */
export function orthonormalBasis(n: Vec3Tuple): { u: Vec3Tuple; v: Vec3Tuple } {
  // Pick a helper axis not parallel to n, then Gram-Schmidt it against n.
  const helper: Vec3Tuple = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dot = helper[0] * n[0] + helper[1] * n[1] + helper[2] * n[2];
  const raw: Vec3Tuple = [helper[0] - dot * n[0], helper[1] - dot * n[1], helper[2] - dot * n[2]];
  const len = Math.hypot(raw[0], raw[1], raw[2]);
  const u: Vec3Tuple = [raw[0] / len, raw[1] / len, raw[2] / len];
  const v: Vec3Tuple = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  return { u, v };
}

function makeField(
  rng: () => number,
  count: number,
  tintWeightsFor: (cls: SizeClass) => readonly number[],
  positionAt: () => Vec3Tuple,
): StarField {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colorIndex = new Uint8Array(count);
  const twinklePhase = new Float32Array(count);
  const twinkleAmp = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const [x, y, z] = positionAt();
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const cls = pickSizeClass(rng());
    const [lo, hi] = SIZE_RANGES[cls];
    sizes[i] = lo + rng() * (hi - lo);

    colorIndex[i] = pickTintIndex(rng(), tintWeightsFor(cls));

    twinklePhase[i] = rng() * TWO_PI;
    twinkleAmp[i] = cls === "small" ? 0 : 0.25 + rng() * 0.25;
  }

  return { positions, sizes, colorIndex, twinklePhase, twinkleAmp };
}

/** Main starfield: uniformly scattered over the sphere. */
export function generateStars(seed: number, count: number): StarField {
  const rng = prng(seed);
  return makeField(
    rng,
    count,
    (cls) => TINT_WEIGHTS[cls],
    () => randomUnitVector(rng),
  );
}

const BAND_SIGMA = 0.18; // radians — Gaussian scatter off the great circle

/**
 * Milky-way band: same size distribution as generateStars, but positions are
 * Gaussian-scattered (sigma ~= BAND_SIGMA) around a great circle whose plane
 * normal is drawn from the seed, and tints skew faint/warm.
 */
export function generateBand(seed: number, count: number): StarField {
  const rng = prng(seed);
  const normal = randomUnitVector(rng);
  const { u, v } = orthonormalBasis(normal);

  const positionAt = (): Vec3Tuple => {
    const theta = rng() * TWO_PI;
    const p0: Vec3Tuple = [
      Math.cos(theta) * u[0] + Math.sin(theta) * v[0],
      Math.cos(theta) * u[1] + Math.sin(theta) * v[1],
      Math.cos(theta) * u[2] + Math.sin(theta) * v[2],
    ];
    // Rotate p0 toward the plane normal by a Gaussian angle: since p0 is
    // unit and orthogonal to normal, this stays on the unit sphere and its
    // angular distance from the great-circle plane is exactly `delta`.
    const delta = gaussian(rng) * BAND_SIGMA;
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);
    return [
      p0[0] * cosD + normal[0] * sinD,
      p0[1] * cosD + normal[1] * sinD,
      p0[2] * cosD + normal[2] * sinD,
    ];
  };

  return makeField(rng, count, () => BAND_TINT_WEIGHTS, positionAt);
}

/**
 * The band's plane normal, derived the same way generateBand derives it
 * internally (first draw off the seed). Exposed so tests — and any render
 * glue that wants to place nebula sprites along the same great circle — can
 * recover it without re-deriving the whole field.
 */
export function bandNormal(seed: number): Vec3Tuple {
  const rng = prng(seed);
  return randomUnitVector(rng);
}

// ---- Constellations: hand-drawn cartoon patterns, seeded onto the sky ----

export interface ConstellationField {
  positions: Float32Array; // unit dirs, xyz per star
  sizes: Float32Array; // big and steady — these anchor the sky
  colorIndex: Uint8Array;
  twinklePhase: Float32Array;
  twinkleAmp: Float32Array; // all zeros: constellations don't twinkle
  lineDirs: Float32Array; // unit-dir PAIRS (2 × xyz per segment) for the connect-the-dots art
}

// Planar star patterns (x right, y up, roughly unit-box scale) + edges.
// Loosely: a dipper, a hunter's hourglass, a W, a kite, and a little arrow.
const PATTERNS: { pts: [number, number][]; edges: [number, number][] }[] = [
  { // dipper
    pts: [[0, 0], [0.28, 0.05], [0.55, 0.02], [0.8, -0.08], [0.85, -0.38], [0.55, -0.42], [0.5, -0.12]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  { // hourglass hunter
    pts: [[0, 0], [0.5, 0.08], [0.12, -0.55], [0.62, -0.5], [0.2, -0.27], [0.32, -0.28], [0.44, -0.29]],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [5, 6]],
  },
  { // the W
    pts: [[0, 0], [0.22, -0.28], [0.45, -0.02], [0.68, -0.3], [0.9, -0.05]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  { // kite
    pts: [[0, 0], [0.3, 0.35], [0.6, 0], [0.3, -0.5]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
  },
  { // little arrow
    pts: [[0, 0], [0.35, 0], [0.7, 0], [0.52, 0.14], [0.52, -0.14]],
    edges: [[0, 1], [1, 2], [2, 3], [2, 4]],
  },
];

const CONSTELLATION_SPREAD = 0.55; // radians across a pattern's long axis

export function generateConstellations(seed: number): ConstellationField {
  const rng = prng(seed ^ 0xc057e11a);
  const starCount = PATTERNS.reduce((n, p) => n + p.pts.length, 0);
  const segCount = PATTERNS.reduce((n, p) => n + p.edges.length, 0);
  const positions = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const colorIndex = new Uint8Array(starCount);
  const twinklePhase = new Float32Array(starCount);
  const twinkleAmp = new Float32Array(starCount); // zeros
  const lineDirs = new Float32Array(segCount * 6);

  let si = 0;
  let li = 0;
  for (const pattern of PATTERNS) {
    // Seeded orthonormal basis: center direction + two tangents.
    const center = randomUnit(rng);
    const tA = orthonormalTo(center, randomUnit(rng));
    const tB = cross(center, tA);
    const roll = rng() * Math.PI * 2;
    const ca = Math.cos(roll);
    const sa = Math.sin(roll);
    const dirs: [number, number, number][] = [];
    for (const [px, py] of pattern.pts) {
      const x = (px - 0.4) * CONSTELLATION_SPREAD;
      const y = (py + 0.2) * CONSTELLATION_SPREAD;
      const u = x * ca - y * sa;
      const v = x * sa + y * ca;
      // Small-angle placement on the sphere around `center`.
      let dx = center[0] + tA[0] * u + tB[0] * v;
      let dy = center[1] + tA[1] * u + tB[1] * v;
      let dz = center[2] + tA[2] * u + tB[2] * v;
      const n = Math.hypot(dx, dy, dz);
      dx /= n; dy /= n; dz /= n;
      dirs.push([dx, dy, dz]);
      positions[si * 3] = dx;
      positions[si * 3 + 1] = dy;
      positions[si * 3 + 2] = dz;
      sizes[si] = 2.8 + rng() * 1.0;
      colorIndex[si] = 1; // warm tint — reads as "named stars"
      twinklePhase[si] = 0;
      si++;
    }
    for (const [a, b] of pattern.edges) {
      const A = dirs[a];
      const B = dirs[b];
      lineDirs.set([A[0], A[1], A[2], B[0], B[1], B[2]], li);
      li += 6;
    }
  }
  return { positions, sizes, colorIndex, twinklePhase, twinkleAmp, lineDirs };
}

function randomUnit(rng: () => number): [number, number, number] {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(a), r * Math.sin(a), z];
}
function orthonormalTo(n: [number, number, number], hint: [number, number, number]): [number, number, number] {
  const d = hint[0] * n[0] + hint[1] * n[1] + hint[2] * n[2];
  let x = hint[0] - n[0] * d;
  let y = hint[1] - n[1] * d;
  let z = hint[2] - n[2] * d;
  let l = Math.hypot(x, y, z);
  if (l < 1e-6) {
    x = -n[1]; y = n[0]; z = 0;
    l = Math.hypot(x, y, z) || 1;
  }
  return [x / l, y / l, z / l];
}
function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
