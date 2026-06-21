// src/game/feel/shake.ts
import { AngularState } from "./turning";

export interface Offset { x: number; y: number; z: number }

export const SHAKE_MAX = 0.18; // metres — peak camera judder
export const LEAN_MAX = 0.25;  // metres — peak g-lean translation

const SPEED_REF = 9000; // m/s where speed's shake contribution saturates
const ACCEL_REF = 60;   // m/s^2 where thrust's shake contribution saturates

// Bounded, time-varying judder. Amplitude blends a speed term and an acceleration term.
export function shakeOffset(speed: number, accelMag: number, t: number): Offset {
  const speedTerm = 1 - Math.exp(-Math.max(0, speed) / SPEED_REF);
  const accelTerm = 1 - Math.exp(-Math.max(0, accelMag) / ACCEL_REF);
  // The 0.5+0.7 coefficients can sum above 1, so Math.min(1, ...) is what enforces the SHAKE_MAX bound — keep it.
  const amp = SHAKE_MAX * Math.min(1, 0.5 * speedTerm + 0.7 * accelTerm);
  // Layered sines at incommensurate frequencies → pseudo-random but deterministic.
  return {
    x: amp * (Math.sin(t * 37.0) * 0.6 + Math.sin(t * 53.3) * 0.4),
    y: amp * (Math.sin(t * 41.7) * 0.6 + Math.sin(t * 61.1) * 0.4),
    z: amp * (Math.sin(t * 47.9) * 0.5),
  };
}

// Cockpit leans opposite the turn so rotation reads as g-force, not a free pivot.
export function gLeanOffset(state: AngularState): Offset {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    x: clamp(-state.yaw) * LEAN_MAX,   // yaw left → lean right
    y: clamp(-state.pitch) * LEAN_MAX, // pitch up → lean back/down
    z: 0,
  };
}
