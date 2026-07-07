// src/game/feel/planetSurface.ts
// Pure per-body surface descriptors: bands, blobs, craters, polar caps.
// Zero Three.js/canvas imports — src/render/scene/planetTexture.ts turns a
// spec into an equirect canvas. Seeded via mulberry32 (prng.ts) so a body's
// look is identical across runs and exactly testable.
//
// Toon identity: hard-edged flat fills only. Every color lives in
// `palette` and fields refer to it by index (or, for polar caps, an
// explicit hex already known to belong to the palette family).

import { prng } from "./prng";

export type SurfaceKind = "banded" | "continents" | "cratered" | "icegiant" | "flat";

export interface Band {
  latStartDeg: number; // [-90, 90)
  latEndDeg: number; // (latStartDeg, 90]
  colorIndex: number; // index into palette
  wobbleAmpDeg: number; // sinusoidal edge wobble amplitude
  wobbleFreq: number; // wobble cycles around the sphere's longitude
}

export interface Blob {
  latDeg: number; // [-90, 90]
  lonDeg: number; // [0, 360)
  radiusDeg: number;
  colorIndex: number;
}

export interface Crater {
  latDeg: number; // [-90, 90]
  lonDeg: number; // [0, 360)
  radiusDeg: number; // painted as a darker ring of palette[1]
}

export interface PolarCaps {
  latDeg: number; // cap begins at +latDeg and mirrors at -latDeg
  color: string;
}

export interface SurfaceSpec {
  kind: SurfaceKind;
  palette: string[];
  bands?: Band[];
  blobs?: Blob[];
  craters?: Crater[];
  polarCaps?: PolarCaps;
}

// Fallback flat color for an unknown body with no color supplied — should
// never actually surface in play (every sim body has a `color`), but keeps
// surfaceSpec total (never throws) even if called oddly.
const DEFAULT_FALLBACK_COLOR = "#888888";

interface BandedConfig {
  kind: "banded" | "icegiant";
  palette: string[];
  bandCount: number;
  wobbleAmpRange: [number, number];
  wobbleFreqRange: [number, number];
}

interface ContinentsConfig {
  kind: "continents";
  palette: string[];
  blobCount: number;
  blobRadiusRange: [number, number];
  blobColorIndex: number;
  polarCapLatDeg: number;
  polarCapColor: string;
}

interface CrateredConfig {
  kind: "cratered";
  palette: string[];
  craterCount: number;
  craterRadiusRange: [number, number];
}

type BodyConfig = BandedConfig | ContinentsConfig | CrateredConfig;

// Per-body starting specs, tuned by name (see task-5-brief.md). Render-side
// config, not sim data — sim's Body carries only a flat `color` hint.
const BODY_CONFIGS: Record<string, BodyConfig> = {
  Jupiter: {
    kind: "banded",
    palette: ["#d9a066", "#b5764a", "#e8c99a", "#c98a5e"],
    bandCount: 6,
    wobbleAmpRange: [2, 4],
    wobbleFreqRange: [2, 4],
  },
  Saturn: {
    kind: "banded",
    palette: ["#e0c088", "#caa86e", "#eed9ac"],
    bandCount: 5,
    wobbleAmpRange: [1, 2],
    wobbleFreqRange: [2, 3],
  },
  Venus: {
    kind: "banded",
    palette: ["#e8c56a", "#d9b055"],
    bandCount: 3,
    wobbleAmpRange: [1, 2],
    wobbleFreqRange: [1, 2],
  },
  Neptune: {
    kind: "icegiant",
    palette: ["#4f6fd9", "#3a55b8"],
    bandCount: 2,
    wobbleAmpRange: [1, 3],
    wobbleFreqRange: [2, 3],
  },
  Uranus: {
    kind: "icegiant",
    palette: ["#7fd0d9", "#63b8c4"],
    bandCount: 2,
    wobbleAmpRange: [1, 3],
    wobbleFreqRange: [2, 3],
  },
  Earth: {
    kind: "continents",
    palette: ["#3f7fd0", "#4faf5f", "#ffffff"],
    blobCount: 7,
    blobRadiusRange: [12, 28],
    blobColorIndex: 1,
    polarCapLatDeg: 68,
    polarCapColor: "#ffffff",
  },
  Mars: {
    kind: "continents",
    palette: ["#c96a3f", "#a24f2e", "#f0e0d0"],
    blobCount: 5,
    blobRadiusRange: [10, 22],
    blobColorIndex: 1,
    polarCapLatDeg: 76,
    polarCapColor: "#f0e0d0",
  },
  Mercury: {
    kind: "cratered",
    palette: ["#9a8f85", "#7d736b"],
    craterCount: 10,
    craterRadiusRange: [3, 9],
  },
  Moon: {
    kind: "cratered",
    palette: ["#b8b4ae", "#948f89"],
    craterCount: 12,
    craterRadiusRange: [3, 9],
  },
};

function lerp(range: [number, number], t: number): number {
  return range[0] + t * (range[1] - range[0]);
}

function makeBands(
  rng: () => number,
  count: number,
  wobbleAmpRange: [number, number],
  wobbleFreqRange: [number, number],
  paletteLen: number,
): Band[] {
  const bands: Band[] = [];
  const step = 180 / count;
  for (let i = 0; i < count; i++) {
    const latStartDeg = -90 + i * step;
    const latEndDeg = i === count - 1 ? 90 : -90 + (i + 1) * step;
    bands.push({
      latStartDeg,
      latEndDeg,
      colorIndex: i % paletteLen,
      wobbleAmpDeg: lerp(wobbleAmpRange, rng()),
      wobbleFreq: Math.round(lerp(wobbleFreqRange, rng())),
    });
  }
  return bands;
}

function makeBlobs(
  rng: () => number,
  count: number,
  radiusRange: [number, number],
  colorIndex: number,
): Blob[] {
  const blobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    blobs.push({
      latDeg: -90 + rng() * 180,
      lonDeg: rng() * 360,
      radiusDeg: lerp(radiusRange, rng()),
      colorIndex,
    });
  }
  return blobs;
}

function makeCraters(rng: () => number, count: number, radiusRange: [number, number]): Crater[] {
  const craters: Crater[] = [];
  for (let i = 0; i < count; i++) {
    craters.push({
      latDeg: -90 + rng() * 180,
      lonDeg: rng() * 360,
      radiusDeg: lerp(radiusRange, rng()),
    });
  }
  return craters;
}

// surfaceSpec(bodyName, seed) -> SurfaceSpec. Deterministic per body+seed;
// never throws — an unrecognized body name (or a future body not yet given
// hand-tuned character) falls back to a flat single-color spec built from
// `fallbackColor` (pass the sim body's own `color`, converted to a hex
// string) so nothing renders unpainted.
export function surfaceSpec(bodyName: string, seed: number, fallbackColor?: string): SurfaceSpec {
  const config = BODY_CONFIGS[bodyName];
  if (!config) {
    return { kind: "flat", palette: [fallbackColor ?? DEFAULT_FALLBACK_COLOR] };
  }

  const rng = prng(seed);
  switch (config.kind) {
    case "banded":
    case "icegiant":
      return {
        kind: config.kind,
        palette: config.palette,
        bands: makeBands(
          rng,
          config.bandCount,
          config.wobbleAmpRange,
          config.wobbleFreqRange,
          config.palette.length,
        ),
      };
    case "continents":
      return {
        kind: "continents",
        palette: config.palette,
        blobs: makeBlobs(rng, config.blobCount, config.blobRadiusRange, config.blobColorIndex),
        polarCaps: { latDeg: config.polarCapLatDeg, color: config.polarCapColor },
      };
    case "cratered":
      return {
        kind: "cratered",
        palette: config.palette,
        craters: makeCraters(rng, config.craterCount, config.craterRadiusRange),
      };
  }
}
