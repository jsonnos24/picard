// The engine always wins: holding throttle-up while captured in a gravity
// ring powers the ship off the swing rail. A hold (not a tap) so brushing W
// mid-swing doesn't silently drop the rail.

export const BREAKAWAY_HOLD = 0.75; // seconds of held thrust to break the tether

export function stepBreakaway(
  hold: number,
  thrustHeld: boolean,
  dt: number,
): { hold: number; free: boolean } {
  if (!thrustHeld) return { hold: 0, free: false };
  const next = hold + dt;
  return { hold: next, free: next >= BREAKAWAY_HOLD };
}

// Decides who gets the ship this frame while ring-captured. DECISION (locked
// by controller, Phase F1 §2): a completed breakaway hold always outranks the
// landing assist's auto-drop — holding W is an explicit player escape and
// must always work, so it is checked (and acted on) before assist ever gets
// a look. Game.stepSim already reads `bk.free` before `this.assistOn`, which
// gives breakaway first refusal every frame; this just names that priority
// as a pure, testable decision instead of leaving it implicit in the if/else
// chain order.
export type CapturedPrecedence = "breakaway" | "assistLand" | "swing";

export function capturedPrecedence(breakawayFree: boolean, assistOn: boolean): CapturedPrecedence {
  if (breakawayFree) return "breakaway";
  if (assistOn) return "assistLand";
  return "swing";
}
