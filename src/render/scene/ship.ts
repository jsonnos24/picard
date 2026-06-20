import * as THREE from "three";

export function createShip(scene: THREE.Scene): { group: THREE.Group } {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(2, 5, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 }),
  );
  group.add(body);

  // three landing legs
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 2.5, -3.5, Math.sin(a) * 2.5);
    leg.rotation.z = Math.cos(a) * 0.4;
    leg.rotation.x = Math.sin(a) * 0.4;
    group.add(leg);
  }

  scene.add(group);
  return { group };
}
