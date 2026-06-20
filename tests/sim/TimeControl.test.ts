import { describe, it, expect } from "vitest";
import { createTimeControl, advance } from "../../src/sim/TimeControl";
import { FIXED_DT } from "../../src/sim/constants";

describe("TimeControl", () => {
  it("yields one step per fixed_dt of real time", () => {
    const tc = createTimeControl();
    const { steps } = advance(tc, FIXED_DT);
    expect(steps).toBe(1);
  });

  it("accumulates fractional remainder across calls", () => {
    let tc = createTimeControl();
    let r = advance(tc, FIXED_DT * 0.6);
    expect(r.steps).toBe(0);
    tc = r.next;
    r = advance(tc, FIXED_DT * 0.6);
    expect(r.steps).toBe(1); // 1.2 dt total -> 1 step, 0.2 left
    expect(r.next.accumulator).toBeCloseTo(FIXED_DT * 0.2, 6);
  });

  it("multiplies elapsed time by timeScale (warp)", () => {
    const tc = { ...createTimeControl(), timeScale: 100 };
    const { steps } = advance(tc, FIXED_DT);
    expect(steps).toBe(100);
  });

  it("caps steps to prevent spiral of death", () => {
    const tc = createTimeControl();
    const { steps } = advance(tc, FIXED_DT * 100000);
    expect(steps).toBe(1000);
  });
});
