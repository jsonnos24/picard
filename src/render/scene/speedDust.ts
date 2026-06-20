import * as THREE from "three";
import { Vec3 } from "../../sim/Vec3";

// A near-field field of faint particles centered on the camera. As the ship moves,
// the particles stream past (opposite to velocity), giving the parallax/motion cue
// that distant stars can't — so high speeds actually *feel* fast. Invisible at rest.
const COUNT = 500;
const HALF = 1200; // metres: half-extent of the cube around the camera

// Deterministic [0,1) hash so the field is stable across reloads (matches starfield style).
function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function wrap(v: number): number {
  // wrap into [-HALF, HALF)
  return v - 2 * HALF * Math.floor((v + HALF) / (2 * HALF));
}

export function createSpeedDust(scene: THREE.Scene): {
  update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3): void;
} {
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = rnd(i + 1) * 2 * HALF - HALF;
    positions[i * 3 + 1] = rnd(i + 101) * 2 * HALF - HALF;
    positions[i * 3 + 2] = rnd(i + 201) * 2 * HALF - HALF;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaac4ff,
    size: 2.0,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3): void {
      const speed = velocity.length();
      // Fade in with speed; fully visible by ~120 m/s, capped so it stays subtle.
      mat.opacity = Math.min(0.55, speed / 120);
      points.position.copy(cameraPos); // keep the field wrapped around the camera

      if (speed > 0.01 && mat.opacity > 0) {
        const dx = velocity.x * dt;
        const dy = velocity.y * dt;
        const dz = velocity.z * dt;
        const arr = geo.attributes.position.array as Float32Array;
        for (let i = 0; i < COUNT; i++) {
          arr[i * 3] = wrap(arr[i * 3] - dx);
          arr[i * 3 + 1] = wrap(arr[i * 3 + 1] - dy);
          arr[i * 3 + 2] = wrap(arr[i * 3 + 2] - dz);
        }
        geo.attributes.position.needsUpdate = true;
      }
    },
  };
}
