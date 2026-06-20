import { Vec3 } from "./Vec3";

export interface MotionState {
  position: Vec3;
  velocity: Vec3;
}

export type AccelFn = (position: Vec3, velocity: Vec3) => Vec3;

export function verletStep(
  state: MotionState,
  dt: number,
  accel: AccelFn,
): MotionState {
  const a = accel(state.position, state.velocity);
  const newPosition = state.position
    .add(state.velocity.scale(dt))
    .add(a.scale(0.5 * dt * dt));
  const aNext = accel(newPosition, state.velocity);
  const newVelocity = state.velocity.add(a.add(aNext).scale(0.5 * dt));
  return { position: newPosition, velocity: newVelocity };
}
