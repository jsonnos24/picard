import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { Spacecraft, thrustAccel } from "./Spacecraft";
import { gravityAccel } from "./gravity";
import { dragAccel } from "./atmosphere";
import { AccelFn } from "./integrator";

// Total acceleration on the ship evaluated at an ARBITRARY (position, velocity),
// so it is correct at both Verlet half-step evaluation points.
// - gravity uses the passed position
// - drag uses the passed position (altitude) AND velocity
// - thrust uses the ship's current orientation/throttle/fuel (control input, not state-position-dependent)
export function shipAccel(
  ship: Spacecraft,
  bodies: Body[],
  position: Vec3,
  velocity: Vec3,
): Vec3 {
  const gravity = gravityAccel(position, bodies);
  // Build a probe with the evaluation-point position/velocity so dragAccel reads them.
  const probe: Spacecraft = { ...ship, position, velocity };
  const drag = dragAccel(probe, bodies);
  const thrust = thrustAccel(ship);
  return gravity.add(drag).add(thrust);
}

// Convenience: the AccelFn closure to hand directly to verletStep.
export function shipAccelFn(ship: Spacecraft, bodies: Body[]): AccelFn {
  return (position, velocity) => shipAccel(ship, bodies, position, velocity);
}
