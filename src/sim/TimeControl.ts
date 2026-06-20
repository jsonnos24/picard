import { FIXED_DT } from "./constants";

const MAX_STEPS = 1000;

export interface TimeControl {
  accumulator: number;
  timeScale: number;
  fixedDt: number;
}

export function createTimeControl(): TimeControl {
  return { accumulator: 0, timeScale: 1, fixedDt: FIXED_DT };
}

export function advance(
  tc: TimeControl,
  frameDelta: number,
): { steps: number; next: TimeControl } {
  let acc = tc.accumulator + frameDelta * tc.timeScale;
  let steps = Math.floor(acc / tc.fixedDt);
  if (steps > MAX_STEPS) steps = MAX_STEPS;
  acc -= steps * tc.fixedDt;
  return { steps, next: { ...tc, accumulator: acc } };
}
