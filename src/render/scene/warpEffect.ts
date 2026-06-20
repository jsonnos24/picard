import * as THREE from "three";

export function createWarpEffect(scene: THREE.Scene): {
  play(): void;
  update(dt: number, cameraPosition?: THREE.Vector3): void;
} {
  const mat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let t = 0;
  return {
    play(): void {
      t = 0.6;
    },
    update(dt: number, cameraPosition?: THREE.Vector3): void {
      if (t > 0) t = Math.max(0, t - dt);
      mat.opacity = t; // simple flash; replace with a streak shader later
      // keep the flash centered on the camera (position passed from Game)
      if (cameraPosition) mesh.position.copy(cameraPosition);
    },
  };
}
