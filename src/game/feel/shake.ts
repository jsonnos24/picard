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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Chase cam is subtler than cockpit — it's a third-person shot, not the
// player's own eyes — so its cap is a fraction of the cockpit peak.
export const CHASE_SHAKE_MAX = 0.35 * SHAKE_MAX;

const THROTTLE_SHAKE_ON = 0.7; // ramp 0→1 above this fraction of full throttle
// atmosphereDensity(0..1) * speed(m/s) saturates at this reference; picked so
// an Earth descent at ~200 m/s (density ≈ 1 near the surface) lands at ≈0.6.
const ATMO_SHAKE_REF = 200 / 0.6;

export interface ChaseShakeInputs {
  throttle: number;
  atmosphereDensity: number;
  speed: number;
  flash: number;
  touchdownImpulse: number; // 0..1, already-decayed magnitude (see ImpulseState below)
}

// Chase-cam judder: four bounded sources summed then clamped to CHASE_SHAKE_MAX,
// same layered-sine approach as shakeOffset so it reads as the same "camera".
export function chaseShake(inputs: ChaseShakeInputs, t: number): Offset {
  const throttleTerm = clamp01((inputs.throttle - THROTTLE_SHAKE_ON) / (1 - THROTTLE_SHAKE_ON));
  const atmoTerm = clamp01((inputs.atmosphereDensity * Math.max(0, inputs.speed)) / ATMO_SHAKE_REF);
  const warpTerm = clamp01(inputs.flash);
  const touchdownTerm = clamp01(inputs.touchdownImpulse);
  const amp = CHASE_SHAKE_MAX * Math.min(1, throttleTerm + atmoTerm + warpTerm + touchdownTerm);
  return {
    x: amp * (Math.sin(t * 37.0) * 0.6 + Math.sin(t * 53.3) * 0.4),
    y: amp * (Math.sin(t * 41.7) * 0.6 + Math.sin(t * 61.1) * 0.4),
    z: amp * (Math.sin(t * 47.9) * 0.5),
  };
}

// Touchdown impulse: a one-shot thump that decays away rather than an
// instantaneous kick, so soft/hard/crash landings each read as a felt hit.
// Kept as an explicit little state object (not module state) so the caller
// (Game.ts) threads it frame-to-frame the same way it threads everything else.
export interface ImpulseState { value: number }
export const TOUCHDOWN_IMPULSE_TAU = 0.4; // seconds

export function idleImpulse(): ImpulseState {
  return { value: 0 };
}

export function addImpulse(state: ImpulseState, amount: number): ImpulseState {
  return { value: clamp01(state.value + amount) };
}

export function decayImpulse(state: ImpulseState, dt: number): ImpulseState {
  return { value: state.value * Math.exp(-Math.max(0, dt) / TOUCHDOWN_IMPULSE_TAU) };
}
