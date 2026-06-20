import * as THREE from "three";
import { Vec3 } from "../sim/Vec3";
import { Intent } from "../sim/input/bindings";

export const ROT_RATE = 0.6; // rad/s

interface AttitudeInput {
  isActive(i: Intent): boolean;
}

export function rotateAttitude(q: THREE.Quaternion, im: AttitudeInput, dt: number): THREE.Quaternion {
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  if (im.isActive("pitchUp")) pitch += 1;
  if (im.isActive("pitchDown")) pitch -= 1;
  if (im.isActive("yawLeft")) yaw += 1;
  if (im.isActive("yawRight")) yaw -= 1;
  if (im.isActive("rollLeft")) roll += 1;
  if (im.isActive("rollRight")) roll -= 1;

  const result = q.clone();
  const step = ROT_RATE * dt;
  // Body-relative rotations: X = pitch, Y = roll (around thrust axis), Z = yaw.
  if (pitch !== 0) result.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch * step));
  if (yaw !== 0) result.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw * step));
  if (roll !== 0) result.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll * step));
  return result.normalize();
}

export function thrustDirection(q: THREE.Quaternion): Vec3 {
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return new Vec3(v.x, v.y, v.z);
}
