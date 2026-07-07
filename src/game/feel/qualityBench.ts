// src/game/feel/qualityBench.ts
// Pure reducer for the startup quality bench (Phase D2, hidden-tab fix in
// Phase F1 §4): averages real frame time over a 60-frame window to feed a
// downgrade-only recheck of the auto-resolved quality tier (see
// Game.applyQualityResolve / resolveQualityTier in quality.ts).
//
// Hidden-tab bug (controller-discovered): a backgrounded/hidden tab throttles
// rAF, so frame gaps balloon to hundreds of ms — that reads as a catastrophic
// bench result and permanently downgrades tier to "low" even on strong
// hardware (the resolve is downgrade-only by design, so it can never claw
// back up). Fix: frames while hidden don't count at all, and the first frame
// after regaining visibility is also discarded (its own dt still spans the
// backgrounded gap) — regaining visibility mid-bench restarts a clean
// 60-frame window rather than resuming a contaminated one.
export const BENCH_WINDOW = 60;

export interface BenchState {
  frameCount: number;
  totalMs: number;
  resolved: boolean;
  wasHidden: boolean;
}

export function idleBenchState(): BenchState {
  return { frameCount: 0, totalMs: 0, resolved: false, wasHidden: false };
}

export interface BenchTickResult {
  state: BenchState;
  avgMs: number | null; // non-null exactly the frame the window completes
}

// dt is the real wall-clock frame gap in seconds (Game's `dt`, already
// skipping the dt===0 first tick before calling this); hidden is
// document.visibilityState === "hidden" at the caller.
export function benchTick(state: BenchState, dt: number, hidden: boolean): BenchTickResult {
  if (state.resolved || dt <= 0) return { state, avgMs: null };

  if (hidden) {
    // Backgrounded: skip accumulation entirely, but remember we saw it so
    // the next visible frame knows to restart rather than resume.
    return state.wasHidden ? { state, avgMs: null } : { state: { ...state, wasHidden: true }, avgMs: null };
  }

  if (state.wasHidden) {
    // Just regained visibility: this frame's dt still spans the backgrounded
    // gap, so it can't be trusted either — discard it and restart a clean
    // window from the next frame.
    return { state: { ...state, wasHidden: false, frameCount: 0, totalMs: 0 }, avgMs: null };
  }

  const frameCount = state.frameCount + 1;
  const totalMs = state.totalMs + dt * 1000;
  if (frameCount >= BENCH_WINDOW) {
    return { state: { ...state, frameCount, totalMs, resolved: true }, avgMs: totalMs / frameCount };
  }
  return { state: { ...state, frameCount, totalMs }, avgMs: null };
}
