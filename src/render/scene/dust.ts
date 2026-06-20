import * as THREE from "three";

export function createDust(scene: THREE.Scene): { puff(at: THREE.Vector3): void; update(dt: number): void } {
  const count = 80;
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xccccbb, size: 0.5, transparent: true, opacity: 0 });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let life = 0;
  return {
    puff(at: THREE.Vector3): void {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        positions[i * 3] = at.x + Math.cos(a) * 2;
        positions[i * 3 + 1] = at.y;
        positions[i * 3 + 2] = at.z + Math.sin(a) * 2;
      }
      geo.attributes.position.needsUpdate = true;
      life = 1.5;
      mat.opacity = 0.8;
    },
    update(dt: number): void {
      if (life > 0) {
        life = Math.max(0, life - dt);
        mat.opacity = (life / 1.5) * 0.8;
      }
    },
  };
}
