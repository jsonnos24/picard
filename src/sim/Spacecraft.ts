import { Vec3 } from "./Vec3";
import { MotionState } from "./integrator";

export interface Spacecraft {
  position: Vec3;
  velocity: Vec3;
  orientation: Vec3; // unit vector main engine pushes along
  mass: number;
  maxThrust: number;
  throttle: number;
}

// Arcade tuning: ~30 m/s² of thrust vs toy Earth's 10 — a punchy launch that
// reaches space in seconds. No fuel: exploring should never strand you.
export function createSpacecraft(position: Vec3): Spacecraft {
  return {
    position: position.clone(),
    velocity: Vec3.zero(),
    orientation: new Vec3(0, 1, 0),
    mass: 8000,
    maxThrust: 2.4e5, // N
    throttle: 0,
  };
}

export function thrustAccel(s: Spacecraft): Vec3 {
  if (s.throttle <= 0) return Vec3.zero();
  const force = s.throttle * s.maxThrust;
  return s.orientation.normalize().scale(force / s.mass);
}

export function toMotionState(s: Spacecraft): MotionState {
  return { position: s.position, velocity: s.velocity };
}

export function applyMotionState(s: Spacecraft, ms: MotionState): Spacecraft {
  return { ...s, position: ms.position, velocity: ms.velocity };
}
