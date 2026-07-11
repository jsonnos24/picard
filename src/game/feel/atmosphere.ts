// src/game/feel/atmosphere.ts
// Pure math for the Earth-only atmosphere visuals (sky dome, clouds, birds).
// No Three/DOM imports — the render modules in src/render/scene/earth*.ts
// call these to drive per-frame opacity and animation.

export const SKY_FULL_ALT = 250; // m — at/below this the sky is fully opaque blue
export const SKY_TOP_ALT = 3000; // m — == Earth's spaceAltitude; sky is gone here
export const BIRD_FULL_ALT = 350; // m — birds fully visible at/below this
export const BIRD_TOP_ALT = 500; // m — birds gone above this

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Smooth Hermite step (same shape as GLSL smoothstep) over [edge0, edge1].
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// Sky-dome opacity: 1 at the ground, smoothly fading to 0 by SKY_TOP_ALT so
// the fade itself is the launch's "sky opens to space" transition.
export function skyFactor(altitude: number): number {
  const a = Math.max(0, altitude);
  return 1 - smoothstep(SKY_FULL_ALT, SKY_TOP_ALT, a);
}

// Opacity of a cloud layer sitting at `layerHeight`: fully visible from below
// (you're looking up at it from the ground) and fading over `band` metres once
// you climb ABOVE it, so each layer streams past and recedes in turn on launch.
export function cloudLayerOpacity(altitude: number, layerHeight: number, band: number): number {
  const a = Math.max(0, altitude);
  if (a <= layerHeight) return 1;
  return clamp01(1 - (a - layerHeight) / band);
}

// Birds: fully visible near the ground, gone by BIRD_TOP_ALT (early in climb).
export function birdVisibility(altitude: number): number {
  const a = Math.max(0, altitude);
  return 1 - smoothstep(BIRD_FULL_ALT, BIRD_TOP_ALT, a);
}

// Ping-pong wing index for flapping: 0 → 1 → 2 → 1 → 0 … over `frameCount`
// frames, so the outer frames aren't held twice as long as a plain cycle.
export function flapFrame(phase: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  const period = 2 * (frameCount - 1);
  let m = Math.floor(phase) % period;
  if (m < 0) m += period;
  return m < frameCount ? m : period - m;
}

// Wrap a drifting offset into [-half, half) so a scattered field recycles
// endlessly as wind (or the camera) moves it. Mirrors the speedDust trick.
export function wrapAround(value: number, half: number): number {
  const span = 2 * half;
  return value - span * Math.floor((value + half) / span);
}
