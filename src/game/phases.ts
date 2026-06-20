import { Phase, canTransition } from "../sim/GameState";

export const SPACE_ALTITUDE = 1.0e5; // 100 km
export const LAUNCH_CLEAR = 50; // m

export interface PhaseContext {
  phase: Phase;
  altitude: number;
  inAtmosphere: boolean;
  primaryName: string;
  launched: boolean;
}

export function nextPhase(ctx: PhaseContext): Phase {
  const want = desired(ctx);
  if (want !== ctx.phase && canTransition(ctx.phase, want)) return want;
  return ctx.phase;
}

function desired(ctx: PhaseContext): Phase {
  switch (ctx.phase) {
    case "LandedEarth":
      return ctx.launched && ctx.altitude > LAUNCH_CLEAR ? "Launching" : "LandedEarth";
    case "Launching":
      return ctx.altitude > SPACE_ALTITUDE ? "InSpace" : "Launching";
    case "InSpace":
      return ctx.primaryName === "Moon" && ctx.altitude < SPACE_ALTITUDE ? "Descending" : "InSpace";
    case "Descending":
      return ctx.altitude > SPACE_ALTITUDE ? "InSpace" : "Descending";
    default:
      return ctx.phase;
  }
}
