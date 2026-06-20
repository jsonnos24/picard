import * as THREE from "three";

export function createAstronaut3D(scene: THREE.Scene): { group: THREE.Group } {
  const group = new THREE.Group();
  const suit = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 }),
  );
  group.add(suit);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.4, roughness: 0.2 }),
  );
  helmet.position.y = 0.9;
  group.add(helmet);
  group.visible = false;
  scene.add(group);
  return { group };
}
