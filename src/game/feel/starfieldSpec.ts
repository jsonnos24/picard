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
