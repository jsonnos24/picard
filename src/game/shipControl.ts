import { Intent } from "../sim/input/bindings";

export const THROTTLE_RATE = 0.8; // per second

interface ControlInput {
  isActive(i: Intent): boolean;
}

export function nextThrottle(throttle: number, im: ControlInput, dt: number): number {
  let t = throttle;
  if (im.isActive("throttleUp")) t += THROTTLE_RATE * dt;
  if (im.isActive("throttleDown")) t -= THROTTLE_RATE * dt;
  return Math.max(0, Math.min(1, t));
}

export function shouldHoldOnSurface(thrustAccelMag: number, surfaceGravity: number): boolean {
  return thrustAccelMag <= surfaceGravity;
}
