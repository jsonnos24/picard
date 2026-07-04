// What a J press means, by situation. Pure decision — Game.ts applies it.
//
// The forgiving rule: J at the target LANDS you; J elsewhere jumps or
// lightspeeds; J never releases the swing only to abort. (The old order —
// fling first, validate after — bounced arrivals in an endless loop: the
// fling aborted inside the target's ring, and the next press cruised you
// right back into capture.)

export type JumpDecision = "none" | "jump" | "lightspeed" | "land";

export interface JumpContext {
  capturedBody: string | null; // body whose ring holds the ship, if captured
  targetName: string | null;
  targetDist: number; // m, ship to target center (ignored when no target)
  targetCaptureRadius: number;
  phaseKind: string;
}

const FLIGHT = new Set(["space", "launching", "descending"]);

export function jumpDecision(ctx: JumpContext): JumpDecision {
  if (!ctx.targetName) {
    // No destination: J is still the swing escape hatch.
    return ctx.capturedBody ? "jump" : "none";
  }
  if (!FLIGHT.has(ctx.phaseKind)) return "none";
  if (ctx.targetDist <= ctx.targetCaptureRadius) {
    // Already at the target — finish the trip instead of flinging away.
    return ctx.phaseKind === "launching" ? "none" : "land";
  }
  return "lightspeed";
}
