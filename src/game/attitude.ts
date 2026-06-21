import * as THREE from "three";
import { Vec3 } from "../sim/Vec3";

export function thrustDirection(q: THREE.Quaternion): Vec3 {
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return new Vec3(v.x, v.y, v.z);
}
