import * as THREE from "three";
import { toonMaterial, addOutline } from "../toon";

// A chunky cartoon rocket: cherry-red capsule, cream nose cap, splayed legs.
export function createShip(scene: THREE.Scene): { group: THREE.Group } {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2, 5, 8, 16), toonMaterial(0xff5d5d, 4));
  addOutline(body, 1.06);
  group.add(body);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), toonMaterial(0xf6f1e5, 4));
  nose.position.y = 3.6;
  addOutline(nose, 1.08);
  group.add(nose);

  // three landing legs
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 4), toonMaterial(0x2e3350, 4));
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 2.5, -3.5, Math.sin(a) * 2.5);
    leg.rotation.z = Math.cos(a) * 0.4;
    leg.rotation.x = Math.sin(a) * 0.4;
    group.add(leg);
  }

  scene.add(group);
  return { group };
}
