// Retro-brake state machine: hold S (BRAKE) after the throttle reaches zero to
// flip retrograde and burn to a stop. Pure logic — Game.ts applies the commands.
//
// Forgiveness rules:
// - The flip only engages after S is held a full grace period AT zero throttle,
//   so easing the throttle down never accidentally spins the ship around.
// - "release" (letting go mid-burn) tells the caller to cut throttle and restore
//   the pre-brake orientation, so W afterwards still means "the way I was going".
// - "stop" tells the caller the ship is arrested; it should cut throttle and
//   point somewhere safe (local up) so W never silently aims at the planet.

export const BRAKE_GRACE = 0.5; // seconds S must stay held at zero throttle before the flip

export interface BrakeState {
  holdZero: number; // seconds S has been held with the throttle at zero
  engaged: boolean;
}

export function idleBrake(): BrakeState {
  return { holdZero: 0, engaged: false };
}

export interface BrakeInput {
  braking: boolean; // throttleDown intent held
  throttle: number; // throttle after this step's input
  speed: number;
  inFlight: boolean;
  aMax: number; // max thrust acceleration, m/s^2
  dt: number;
}

export type BrakeCommand = "none" | "burn" | "stop" | "release";

export function stepBrake(
  state: BrakeState,
  input: BrakeInput,
): { state: BrakeState; command: BrakeCommand } {
  if (!input.braking || !input.inFlight || input.speed <= 0) {
    return { state: idleBrake(), command: state.engaged ? "release" : "none" };
  }

  if (state.engaged) {
    // Close enough to stop cleanly instead of jittering around zero.
    if (input.speed <= input.aMax * input.dt * 1.5) {
      return { state: idleBrake(), command: "stop" };
    }
    return { state, command: "burn" };
  }

  // Not engaged: the grace timer only runs while the throttle sits at zero.
  if (input.throttle > 0) {
    return { state: idleBrake(), command: "none" };
  }
  const holdZero = state.holdZero + input.dt;
  if (holdZero < BRAKE_GRACE) {
    return { state: { holdZero, engaged: false }, command: "none" };
  }
  return { state: { holdZero, engaged: true }, command: "burn" };
}
