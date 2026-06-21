// src/game/feel/fov.ts
export const FOV_BASE = 70;       // deg — matches Renderer's PerspectiveCamera default
export const FOV_MAX = 95;        // deg — widest "barely contained" framing
export const FOV_SPEED_REF = 6000; // m/s — speed scale over which FOV approaches max

// Eased saturating curve: base at rest, asymptotically approaching FOV_MAX.
export function fovForSpeed(speed: number): number {
  const s = Math.max(0, speed);
  const k = 1 - Math.exp(-s / FOV_SPEED_REF);
  return FOV_BASE + (FOV_MAX - FOV_BASE) * k;
}
