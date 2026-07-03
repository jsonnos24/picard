import { Phase, canTransition, samePhase } from "../sim/GameState";

export const LAUNCH_CLEAR = 50; // m

// "Space" begins one body-radius above the surface — chunky toy-scale bodies,
// so every threshold scales with the world you're at.
export function spaceAltitude(primaryRadius: number): number {
  return primaryRadius;
}

export interface PrimaryInfo {
  name: string;
  radius: number;
  landable: boolean;
}

export interface PhaseContext {
  phase: Phase;
  altitude: number;
  primary: PrimaryInfo;
  launched: boolean;
}

export function nextPhase(ctx: PhaseContext): Phase {
  const want = desired(ctx);
  if (!samePhase(want, ctx.phase) && canTransition(ctx.phase, want)) return want;
  return ctx.phase;
}

function desired(ctx: PhaseContext): Phase {
  const space = spaceAltitude(ctx.primary.radius);
  switch (ctx.phase.kind) {
    case "landed":
      return ctx.launched && ctx.altitude > LAUNCH_CLEAR
        ? { kind: "launching", body: ctx.phase.body }
        : ctx.phase;
    case "launching":
      return ctx.altitude > space ? { kind: "space" } : ctx.phase;
    case "space":
      return ctx.primary.landable && ctx.altitude < space
        ? { kind: "descending", body: ctx.primary.name }
        : ctx.phase;
    case "descending":
      return ctx.altitude > space ? { kind: "space" } : ctx.phase;
    default:
      return ctx.phase;
  }
}
