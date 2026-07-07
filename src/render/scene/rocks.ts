import * as THREE from "three";
import { toonMaterial } from "../toon";
import { prng } from "../../game/feel/prng";

// Scattered toon rocks around a landing site. Walking had no parallax — the
// painted ground is one flat texel for tens of metres, so the astronaut moved
// without anything on screen moving. A ring of nearby rocks fixes that.
//
// Placement is static in render space per show(): while landed/on foot the
// ship barely moves, so the floating origin never rebases mid-visit.

const ROCK_COUNT = 18;
const RING_MIN = 5; // m from the site
const RING_MAX = 65;
const TONES = [0x8d8377, 0x6f665c];

export interface Rocks {
  show(center: THREE.Vector3, up: THREE.Vector3, seed: number): void;
  hide(): void;
  readonly visible: boolean;
}

export function createRocks(scene: THREE.Scene): Rocks {
  const group = new THREE.Group();
  group.visible = false;
  const mats = TONES.map((c) => toonMaterial(c));
  const meshes: THREE.Mesh[] = [];
  for (let i = 0; i < ROCK_COUNT; i++) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
    meshes.push(mesh);
    group.add(mesh);
  }
  scene.add(group);

  return {
    get visible(): boolean {
      return group.visible;
    },
    show(center: THREE.Vector3, up: THREE.Vector3, seed: number): void {
      const rng = prng(seed >>> 0);
      // Tangent basis at the site.
      const ref = Math.abs(up.x) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const tA = ref.clone().sub(up.clone().multiplyScalar(ref.dot(up))).normalize();
      const tB = new THREE.Vector3().crossVectors(up, tA);
      for (const mesh of meshes) {
        const r = RING_MIN + rng() * (RING_MAX - RING_MIN);
        const a = rng() * Math.PI * 2;
        const s = 0.35 + rng() * 1.3;
        mesh.scale.setScalar(s);
        mesh.position
          .copy(center)
          .add(tA.clone().multiplyScalar(Math.cos(a) * r))
          .add(tB.clone().multiplyScalar(Math.sin(a) * r))
          .add(up.clone().multiplyScalar(s * 0.35)); // settle into the ground
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        mesh.rotateY(rng() * Math.PI * 2);
      }
      group.visible = true;
    },
    hide(): void {
      group.visible = false;
    },
  };
}
