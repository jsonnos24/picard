import * as THREE from "three";
import { toonMaterial, addOutline } from "../toon";

export function createAstronaut3D(scene: THREE.Scene): { group: THREE.Group } {
  const group = new THREE.Group();
  const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 6, 12), toonMaterial(0xf6f1e5, 4));
  addOutline(suit, 1.12);
  group.add(suit);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), toonMaterial(0x27304d, 4));
  helmet.position.y = 0.9;
  addOutline(helmet, 1.12);
  group.add(helmet);
  group.visible = false;
  scene.add(group);
  return { group };
}
