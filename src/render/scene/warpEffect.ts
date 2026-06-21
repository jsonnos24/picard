import * as THREE from "three";

// A forward streak-tunnel plus a full-frame white flash, both driven by intensities
// from the warp sequence (no internal timer).
export function createWarpEffect(scene: THREE.Scene): {
  update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void;
} {
  // Radial streak lines pointing forward (camera local -Z), built around the origin
  // and positioned at the camera each frame.
  const COUNT = 200;
  const verts = new Float32Array(COUNT * 6);
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    const r = 6 + (i % 7);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const o = i * 6;
    verts[o] = x; verts[o + 1] = y; verts[o + 2] = -8;       // near
    verts[o + 3] = x; verts[o + 4] = y; verts[o + 5] = -220; // far (forward)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  const tunnelMat = new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const tunnelLines = new THREE.LineSegments(geo, tunnelMat);
  tunnelLines.frustumCulled = false;
  tunnelLines.renderOrder = 999;
  scene.add(tunnelLines);

  // White flash: a big screen-facing sphere shell around the camera.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), flashMat);
  flashMesh.frustumCulled = false;
  flashMesh.renderOrder = 1000;
  scene.add(flashMesh);

  return {
    update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void {
      tunnelMat.opacity = Math.max(0, Math.min(1, tunnel)) * 0.9;
      flashMat.opacity = Math.max(0, Math.min(1, flash));
      tunnelLines.position.copy(cameraPos);
      flashMesh.position.copy(cameraPos);
    },
  };
}
