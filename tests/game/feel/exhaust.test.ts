// tests/game/feel/exhaust.test.ts
import { describe, it, expect } from "vitest";
import { initExhaustState, exhaustStep, takeEmits, EMIT_RATE, FLICKER_AMP } from "../../../src/game/feel/exhaust";

describe("exhaustStep", () => {
  it("attacks faster than it releases over the same dt", () => {
    // Rising from 0 toward full throttle.
    const rising = exhaustStep(initExhaustState(1), 1, 0.08);
    // Falling from full length toward zero throttle, same dt.
    const full = { ...initExhaustState(1), length: 1 };
    const falling = exhaustStep(full, 0, 0.08);
    const rise = rising.length - 0;
    const fall = 1 - falling.length;
    expect(rise).toBeGreaterThan(fall);
  });

  it("decays to ~0 length when throttle stays at zero", () => {
    let state = { ...initExhaustState(2), length: 1 };
    for (let i = 0; i < 200; i++) state = exhaustStep(state, 0, 1 / 60);
    expect(state.length).toBeLessThan(0.01);
  });

  it("approaches full length when throttle stays at 1", () => {
    let state = initExhaustState(3);
    for (let i = 0; i < 200; i++) state = exhaustStep(state, 1, 1 / 60);
    expect(state.length).toBeGreaterThan(0.99);
  });

  it("keeps flicker within ±FLICKER_AMP of 1.0", () => {
    let state = initExhaustState(4);
    for (let i = 0; i < 500; i++) {
      state = exhaustStep(state, 1, 1 / 60);
      expect(state.flicker).toBeGreaterThanOrEqual(1 - FLICKER_AMP - 1e-9);
      expect(state.flicker).toBeLessThanOrEqual(1 + FLICKER_AMP + 1e-9);
    }
  });

  it("accumulates emitAccum proportional to throttle * dt * EMIT_RATE", () => {
    const state = exhaustStep(initExhaustState(5), 1, 0.5);
    expect(state.emitAccum).toBeCloseTo(0.5 * EMIT_RATE, 5);
  });

  it("is deterministic given the same seed and input sequence", () => {
    let a = initExhaustState(99);
    let b = initExhaustState(99);
    for (let i = 0; i < 50; i++) {
      a = exhaustStep(a, 0.7, 1 / 60);
      b = exhaustStep(b, 0.7, 1 / 60);
    }
    expect(a).toEqual(b);
  });

  it("is a no-op when dt is 0", () => {
    const state = { ...initExhaustState(6), length: 0.4, emitAccum: 3.2 };
    const next = exhaustStep(state, 1, 0);
    expect(next).toEqual(state);
  });

  it("is a no-op when dt is negative", () => {
    const state = { ...initExhaustState(7), length: 0.4 };
    const next = exhaustStep(state, 1, -0.1);
    expect(next).toEqual(state);
  });

  it("clamps length to [0,1] even for out-of-range throttle", () => {
    let state = initExhaustState(8);
    for (let i = 0; i < 200; i++) state = exhaustStep(state, 5, 1 / 60);
    expect(state.length).toBeLessThanOrEqual(1);
    for (let i = 0; i < 200; i++) state = exhaustStep(state, -3, 1 / 60);
    expect(state.length).toBeGreaterThanOrEqual(0);
  });
});

describe("takeEmits", () => {
  it("returns the integer part of emitAccum and keeps the fractional remainder", () => {
    const state = { length: 0, flicker: 1, emitAccum: 5.7, rngState: 1 };
    const { state: next, count } = takeEmits(state);
    expect(count).toBe(5);
    expect(next.emitAccum).toBeCloseTo(0.7, 6);
  });

  it("returns 0 when emitAccum is below 1", () => {
    const state = { length: 0, flicker: 1, emitAccum: 0.3, rngState: 1 };
    const { state: next, count } = takeEmits(state);
    expect(count).toBe(0);
    expect(next.emitAccum).toBeCloseTo(0.3, 6);
  });
});
