// What a J press means, by situation. Pure decision — Game.ts applies it.
//
// The forgiving rule: J at the target LANDS you; J elsewhere jumps or
// lightspeeds; J never releases the swing only to abort. (The old order —
// fling first, validate after — bounced arrivals in an endless loop: the
// fling aborted inside the target's ring, and the next press cruised you
// right back into capture.)

// freeJump: no destination needed — cruise wherever the nose points and let
// the first gravity bubble on the flight ray end the trip.
export type JumpDecision = "none" | "lightspeed" | "land" | "freeJump";

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
    // No destination: fly free. Captured counts — release AND jump in one
    // motion; a bare fling falls back inbound and the ring recaptures it.
    if (ctx.capturedBody) return "freeJump";
    return CAN_JUMP.has(ctx.phaseKind) ? "freeJump" : "none";
  }
  if (!CAN_JUMP.has(ctx.phaseKind)) return "none";
  if (ctx.targetDist <= ctx.targetCaptureRadius) {
    // Already at the target — finish the trip instead of flinging away;
    // on the ground or climbing off it, J just goes (nose-first).
    return ctx.phaseKind === "landed" || ctx.phaseKind === "launching" ? "freeJump" : "land";
  }
  return "lightspeed";
}
