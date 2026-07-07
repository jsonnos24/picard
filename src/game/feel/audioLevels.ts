// src/game/feel/audioLevels.ts
// Continuous layer targets (0..1) a WebAudio director smooths toward each
// frame — no DOM/WebAudio here, just the mapping from a FrameSnapshot to gain
// targets and a couple of modulation "hints" (pitch, filter cutoff).
import type { FrameSnapshot } from "./snapshot";

// NOTE on atmosphereDensity: FrameSnapshot.atmosphereDensity is NOT the raw
// kg/m^3 figure from src/sim/atmosphere.ts (airDensity) — buildSnapshot()
// derives it as a synthetic 0..1 proximity metric (1 at the surface, 0 by
// SKIM_ALT=600m; see snapshot.ts). So no extra scaling against atmosphere.ts
// magnitudes is needed: this field is already normalized. WIND_SPEED_REF=300
// (as specified) combined with that 0..1 density puts a typical near-surface
// descent at 100-300 m/s in the ~0.3-1.0 band, which is the intended range.
export const WIND_SPEED_REF = 300; // m/s

export type Layer = "engine" | "wind" | "warpBed" | "rumble" | "danger";

export const SMOOTHING: Record<Layer, { attack: number; release: number }> = {
  engine: { attack: 0.1, release: 0.3 },
  wind: { attack: 0.5, release: 1.0 },
  warpBed: { attack: 0.2, release: 0.8 },
  rumble: { attack: 0.05, release: 0.4 },
  danger: { attack: 0.05, release: 0.2 },
};

export interface Levels {
  engine: number;
  enginePitch: number; // modulation hint, not a gain
  wind: number;
  windCutoff: number; // modulation hint, not a gain
  warpBed: number;
  rumble: number;
  danger: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function audioLevels(cur: FrameSnapshot): Levels {
  // navMapOpen isn't checked separately: Game's shared uiPaused gate always
  // sets `paused` true whenever navMapOpen is true (see Game.ts's `uiPaused`
  // getter), so `paused` alone is the single real gate.
  if (cur.paused) {
    // Hints reset to neutral (no pitch/filter shift) rather than 0 — nothing
    // reads them while their gain is silent, but 0 would read as "shifted
    // all the way down" if anything ever samples them directly.
    return { engine: 0, enginePitch: 1, wind: 0, windCutoff: 0, warpBed: 0, rumble: 0, danger: 0 };
  }

  const throttle = clamp01(cur.throttle);
  const engine = Math.pow(throttle, 0.7);
  const enginePitch = 1 + 0.4 * throttle;

  const wind = clamp01((cur.atmosphereDensity * cur.speed) / WIND_SPEED_REF);
  const windCutoff = clamp01(cur.speed / WIND_SPEED_REF);

  const warpBed = clamp01(cur.tunnel);
  const rumble = clamp01((cur.slingKind === "captured" ? 0.5 : 0) + cur.flash * 0.5);

  const danger = cur.inSunBubble || cur.warnDescent ? 1 : 0;

  return { engine, enginePitch, wind, windCutoff, warpBed, rumble, danger };
}
