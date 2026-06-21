import * as THREE from "three";
import { Vec3 } from "../../sim/Vec3";
import { streakParams } from "../../game/feel/streak";

const COUNT = 500;
const HALF = 1200; // metres: half-extent of the cube around the camera

function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function wrap(v: number): number {
  return v - 2 * HALF * Math.floor((v + HALF) / (2 * HALF));
}

export function createSpeedDust(scene: THREE.Scene): {
  update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3, boost?: number): void;
} {
  // Two endpoints per particle: [head, tail]. Head holds the base position; tail
  // is recomputed each frame as head - velDir * length.
  const base = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    base[i * 3] = rnd(i + 1) * 2 * HALF - HALF;
    base[i * 3 + 1] = rnd(i + 101) * 2 * HALF - HALF;
    base[i * 3 + 2] = rnd(i + 201) * 2 * HALF - HALF;
  }
  const verts = new Float32Array(COUNT * 6); // 2 points * 3 coords
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xaac4ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);

  return {
    update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3, boost = 0): void {
      const speed = velocity.length();
      const p = streakParams(speed, boost);
      mat.opacity = p.opacity;
      lines.position.copy(cameraPos);

      if (speed > 0.01 && p.opacity > 0) {
        const inv = 1 / speed;
        const dirx = velocity.x * inv, diry = velocity.y * inv, dirz = velocity.z * inv;
        const dx = velocity.x * dt, dy = velocity.y * dt, dz = velocity.z * dt;
        const L = p.length;
        for (let i = 0; i < COUNT; i++) {
          // Advance the base position opposite to velocity (parallax), wrapped.
          base[i * 3] = wrap(base[i * 3] - dx);
          base[i * 3 + 1] = wrap(base[i * 3 + 1] - dy);
          base[i * 3 + 2] = wrap(base[i * 3 + 2] - dz);
          const hx = base[i * 3], hy = base[i * 3 + 1], hz = base[i * 3 + 2];
          const o = i * 6;
          verts[o] = hx; verts[o + 1] = hy; verts[o + 2] = hz;             // head
          verts[o + 3] = hx - dirx * L; verts[o + 4] = hy - diry * L; verts[o + 5] = hz - dirz * L; // tail
        }
        geo.attributes.position.needsUpdate = true;
      }
    },
  };
}
