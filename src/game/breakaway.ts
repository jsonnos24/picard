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
