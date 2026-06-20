import { Vec3 } from "./Vec3";
import { Body, surfaceGravity } from "./Body";

const WALK_SPEED = 3; // m/s
const JUMP_SPEED = 4; // m/s

export interface Astronaut {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
}

export function createAstronaut(position: Vec3): Astronaut {
  return { position: position.clone(), velocity: Vec3.zero(), onGround: false };
}

export function stepAstronaut(
  a: Astronaut,
  body: Body,
  walkDir: Vec3,
  jump: boolean,
  dt: number,
): Astronaut {
  const up = a.position.sub(body.position).normalize(); // local "up"
  const g = surfaceGravity(body);

  // Start from current vertical velocity (component along up); horizontal is set by walk.
  let vertical = a.velocity.dot(up);
  if (jump && a.onGround) {
    vertical = JUMP_SPEED;
  }

  // Horizontal walk velocity: project requested direction onto the tangent plane.
  const tangentDir = walkDir.sub(up.scale(walkDir.dot(up)));
  const horizontalVel =
    tangentDir.lengthSq() > 0 ? tangentDir.normalize().scale(WALK_SPEED) : Vec3.zero();

  // Apply gravity to vertical velocity.
  vertical -= g * dt;

  const velocity = horizontalVel.add(up.scale(vertical));
  let position = a.position.add(velocity.scale(dt));

  // Clamp to surface.
  let onGround = false;
  const altitude = position.sub(body.position).length() - body.radius;
  if (altitude <= 0) {
    const newUp = position.sub(body.position).normalize();
    position = body.position.add(newUp.scale(body.radius));
    onGround = true;
    // remove inward vertical velocity, keep horizontal
    const inward = velocity.dot(newUp);
    const corrected = inward < 0 ? velocity.sub(newUp.scale(inward)) : velocity;
    return { position, velocity: corrected, onGround };
  }

  return { position, velocity, onGround };
}
