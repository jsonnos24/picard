// src/game/feel/exhaust.ts
// Pure kinematics for the engine flame: a lagged "length" that chases
// throttle asymmetrically (snaps up fast on the attack, eases down slower
// on release, like a real flame catching and dying), a seeded flicker
// multiplier for cartoon flame flutter, and an accumulator that turns
// sustained throttle into a whole-number trail-particle emission count so
// the render glue never has to guess how many segments to spawn this frame.
import { mulberry32Step } from "./prng";

export interface ExhaustState {
  length: number; // 0..1, lagged throttle
  flicker: number; // multiplier around 1.0, ±FLICKER_AMP
  emitAccum: number; // fractional trail-particle emission accumulator
  rngState: number; // mulberry32 state driving flicker, carried so the
  // sequence is deterministic given a seed and an input history — no
  // closures, so ExhaustState stays plain, serializable data.
}

export const ATTACK_TAU = 0.08; // s — rising response (throttle up)
export const RELEASE_TAU = 0.25; // s — falling response (throttle down)
export const FLICKER_AMP = 0.12; // ±12% around 1.0
export const EMIT_RATE = 40; // trail particles/sec at full throttle

export function initExhaustState(seed: number): ExhaustState {
  return { length: 0, flicker: 1, emitAccum: 0, rngState: seed >>> 0 };
}

export function exhaustStep(state: ExhaustState, throttle: number, dt: number): ExhaustState {
  if (dt <= 0) return state;
  const target = Math.max(0, Math.min(1, throttle));
  const tau = target > state.length ? ATTACK_TAU : RELEASE_TAU;
  const k = 1 - Math.exp(-dt / tau);
  const length = Math.max(0, Math.min(1, state.length + (target - state.length) * k));

  const { next, value } = mulberry32Step(state.rngState);
  const flicker = 1 + (value * 2 - 1) * FLICKER_AMP;

  const emitAccum = state.emitAccum + target * dt * EMIT_RATE;

  return { length, flicker, emitAccum, rngState: next };
}

// Drains the whole-number part of the emission accumulator, keeping the
// fractional remainder so emission stays smooth (not lumpy) across frames
// of varying dt.
export function takeEmits(state: ExhaustState): { state: ExhaustState; count: number } {
  const count = Math.floor(state.emitAccum);
  return { state: { ...state, emitAccum: state.emitAccum - count }, count };
}
