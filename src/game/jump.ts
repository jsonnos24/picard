// What a J press means, by situation. Pure decision — Game.ts applies it.
//
// The forgiving rule: J at the target LANDS you; J elsewhere jumps or
// lightspeeds; J never releases the swing only to abort. (The old order —
// fling first, validate after — bounced arrivals in an endless loop: the
// fling aborted inside the target's ring, and the next press cruised you
// right back into capture.)

// pickTarget: J with no destination — steer the player to the map instead of
// dying silently. atTarget: standing on (or lifting off) the destination.
export type JumpDecision = "none" | "jump" | "lightspeed" | "land" | "pickTarget" | "atTarget";

// J is a toggle that answers on every tap: start a jump, abort the wind-up,
// or drop out of the cruise — never a dead key waiting for a cinematic.
export type LsTap = "start" | "abort" | "dropout";

export function lightspeedTap(cruising: boolean, seqPhase: string): LsTap {
  if (cruising) return "dropout";
  if (seqPhase === "charge" || seqPhase === "burst") return "abort";
  return "start"; // idle or settle — free to (re-)engage
}

export interface JumpContext {
  capturedBody: string | null; // body whose ring holds the ship, if captured
  targetName: string | null;
  targetDist: number; // m, ship to target center (ignored when no target)
  targetCaptureRadius: number;
  phaseKind: string;
}

// "landed" counts: J is the go button — a jump charges on the pad and leaps.
const CAN_JUMP = new Set(["landed", "space", "launching", "descending"]);

export function jumpDecision(ctx: JumpContext): JumpDecision {
  if (!ctx.targetName) {
    // No destination: J is still the swing escape hatch; otherwise ask.
    if (ctx.capturedBody) return "jump";
    return CAN_JUMP.has(ctx.phaseKind) ? "pickTarget" : "none";
  }
  if (!CAN_JUMP.has(ctx.phaseKind)) return "none";
  if (ctx.targetDist <= ctx.targetCaptureRadius) {
    // Already at the target — finish the trip instead of flinging away;
    // on the ground or climbing off it, say so instead of going quiet.
    return ctx.phaseKind === "landed" || ctx.phaseKind === "launching" ? "atTarget" : "land";
  }
  return "lightspeed";
}
