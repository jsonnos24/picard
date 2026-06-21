// src/game/feel/turning.ts
import * as THREE from "three";
import { Intent } from "../../sim/input/bindings";

export interface AngularState { pitch: number; yaw: number; roll: number } // rad/s

export const MAX_RATE = 0.9;   // rad/s at full deflection (was a flat ROT_RATE=0.6)
export const RATE_ACCEL = 3.0; // rad/s^2 ramp toward the commanded rate
export const RATE_DAMP = 2.5;  // 1/s exponential-ish decay when no input on that axis

interface TurnInput { isActive(i: Intent): boolean }

export function zeroAngular(): AngularState {
  return { pitch: 0, yaw: 0, roll: 0 };
}

// Move a single axis rate toward its command: accelerate when commanded, damp toward 0 when not.
function stepAxis(rate: number, command: number, dt: number): number {
  if (command !== 0) {
    const target = command * MAX_RATE;
    const delta = target - rate;
    const step = RATE_ACCEL * dt;
    return Math.abs(delta) <= step ? target : rate + Math.sign(delta) * step;
  }
  // No input: decay toward zero.
  const decay = Math.exp(-RATE_DAMP * dt);
  const next = rate * decay;
  return Math.abs(next) < 1e-4 ? 0 : next;
}

export function stepTurning(
  q: THREE.Quaternion,
  state: AngularState,
  im: TurnInput,
  dt: number,
): { quat: THREE.Quaternion; state: AngularState } {
  const cmdPitch = (im.isActive("pitchUp") ? 1 : 0) + (im.isActive("pitchDown") ? -1 : 0);
  const cmdYaw = (im.isActive("yawLeft") ? 1 : 0) + (im.isActive("yawRight") ? -1 : 0);
  const cmdRoll = (im.isActive("rollLeft") ? 1 : 0) + (im.isActive("rollRight") ? -1 : 0);

  const next: AngularState = {
    pitch: stepAxis(state.pitch, cmdPitch, dt),
    yaw: stepAxis(state.yaw, cmdYaw, dt),
    roll: stepAxis(state.roll, cmdRoll, dt),
  };

  // Apply body-relative rotations (same axis convention as attitude.ts:
  // X = pitch, Z = yaw, Y = roll/thrust axis).
  const quat = q.clone();
  if (next.pitch !== 0) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), next.pitch * dt));
  if (next.yaw !== 0) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), next.yaw * dt));
  if (next.roll !== 0) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), next.roll * dt));
  return { quat: quat.normalize(), state: next };
}
