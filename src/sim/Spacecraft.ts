import { Vec3 } from "./Vec3";
import { MotionState } from "./integrator";

export interface Spacecraft {
  position: Vec3;
  velocity: Vec3;
  orientation: Vec3; // unit vector main engine pushes along
  dryMass: number;
  fuelMass: number;
  maxThrust: number;
  throttle: number;
  exhaustVelocity: number;
}

// Tunable starting values; refined in playtest (Plan B).
export function createSpacecraft(position: Vec3): Spacecraft {
  return {
    position: position.clone(),
    velocity: Vec3.zero(),
    orientation: new Vec3(0, 1, 0),
    dryMass: 5000,
    fuelMass: 30000, // generous delta-v margin for launch + a powered descent/landing
    maxThrust: 1.2e6, // N — strong enough to launch off Earth
    throttle: 0,
    exhaustVelocity: 3500, // m/s
  };
}

export function totalMass(s: Spacecraft): number {
  return s.dryMass + s.fuelMass;
}

export function thrustAccel(s: Spacecraft): Vec3 {
  if (s.fuelMass <= 0 || s.throttle <= 0) return Vec3.zero();
  const force = s.throttle * s.maxThrust;
  return s.orientation.normalize().scale(force / totalMass(s));
}

export function burnFuel(s: Spacecraft, dt: number): Spacecraft {
  const mdot = (s.throttle * s.maxThrust) / s.exhaustVelocity;
  const newFuel = Math.max(0, s.fuelMass - mdot * dt);
  return { ...s, fuelMass: newFuel };
}

export function toMotionState(s: Spacecraft): MotionState {
  return { position: s.position, velocity: s.velocity };
}

export function applyMotionState(s: Spacecraft, ms: MotionState): Spacecraft {
  return { ...s, position: ms.position, velocity: ms.velocity };
}
