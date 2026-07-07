// tests/game/feel/qualityBench.test.ts
import { describe, it, expect } from "vitest";
import { benchTick, idleBenchState, BENCH_WINDOW } from "../../../src/game/feel/qualityBench";

describe("benchTick — startup quality bench, hidden-tab safe", () => {
  it("resolves after BENCH_WINDOW clean visible frames with the correct average", () => {
    let state = idleBenchState();
    let avgMs: number | null = null;
    for (let i = 0; i < BENCH_WINDOW; i++) {
      const r = benchTick(state, 0.01, false); // 10ms/frame throughout (dt is seconds)
      state = r.state;
      avgMs = r.avgMs;
    }
    expect(state.resolved).toBe(true);
    expect(avgMs).toBeCloseTo(10, 6);
  });

  it("does not resolve before BENCH_WINDOW frames", () => {
    let state = idleBenchState();
    for (let i = 0; i < BENCH_WINDOW - 1; i++) {
      state = benchTick(state, 0.01, false).state;
    }
    expect(state.resolved).toBe(false);
    expect(state.frameCount).toBe(BENCH_WINDOW - 1);
  });

  it("ignores frames while hidden — they never count toward the window", () => {
    let state = idleBenchState();
    for (let i = 0; i < 200; i++) {
      state = benchTick(state, 0.5, true).state; // huge throttled gaps, hidden
    }
    expect(state.frameCount).toBe(0);
    expect(state.totalMs).toBe(0);
    expect(state.resolved).toBe(false);
  });

  it("discards the resume frame and restarts a clean window on visibility regain", () => {
    let state = idleBenchState();
    // Run a partial clean window, then background the tab mid-bench.
    for (let i = 0; i < 30; i++) state = benchTick(state, 0.01, false).state;
    expect(state.frameCount).toBe(30);
    state = benchTick(state, 0.5, true).state; // went hidden
    // The very first frame back is a huge dt spanning the backgrounded gap.
    const resume = benchTick(state, 0.9, false);
    expect(resume.state.frameCount).toBe(0);
    expect(resume.state.totalMs).toBe(0);
    expect(resume.avgMs).toBeNull();
    // From here a fresh, clean 60-frame window resolves normally.
    let s = resume.state;
    let avgMs: number | null = null;
    for (let i = 0; i < BENCH_WINDOW; i++) {
      const r = benchTick(s, 0.008, false);
      s = r.state;
      avgMs = r.avgMs;
    }
    expect(s.resolved).toBe(true);
    expect(avgMs).toBeCloseTo(8, 6);
  });

  it("never re-fires once resolved, even if fed more frames", () => {
    let state = idleBenchState();
    for (let i = 0; i < BENCH_WINDOW; i++) state = benchTick(state, 0.01, false).state;
    expect(state.resolved).toBe(true);
    const r = benchTick(state, 0.999, false);
    expect(r.avgMs).toBeNull();
    expect(r.state).toBe(state); // untouched — same object, no-op
  });

  it("ignores the dt<=0 first-tick frame (never counts, never flags hidden)", () => {
    const state = idleBenchState();
    const r = benchTick(state, 0, false);
    expect(r.state).toBe(state);
    expect(r.avgMs).toBeNull();
  });
});
