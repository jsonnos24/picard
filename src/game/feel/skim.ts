// src/game/feel/skim.ts
export const SKIM_ALT = 1500;   // metres — below this, skim proximity ramps in
export const SKIM_SPEED = 300;  // m/s — above this, skim speed factor ramps in

// Product of a proximity factor (low altitude → 1) and a speed factor (fast → 1).
export function skimIntensity(altitude: number, speed: number): number {
  const prox = Math.max(0, Math.min(1, 1 - Math.max(0, altitude) / SKIM_ALT));
  const fast = Math.max(0, Math.min(1, (Math.max(0, speed) - SKIM_SPEED) / (SKIM_SPEED * 4)));
  return Math.max(0, Math.min(1, prox * fast));
}
