import * as THREE from "three";
import { Body } from "../../sim/Body";
import { toRender, FloatingOrigin } from "../../sim/FloatingOrigin";

export function createStarfield(): THREE.Points {
  const count = 3000;
  const radius = 5e8;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = (i * 2.399963) % (Math.PI * 2);
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5e6, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

export interface BodyView {
  body: Body;
  mesh: THREE.Mesh;
}

const BODY_COLORS: Record<string, number> = {
  Earth: 0x2a6cb0,
  Moon: 0x999999,
};

export function createBodies(scene: THREE.Scene, bodies: Body[]): BodyView[] {
  // Soft fill so shadowed hemispheres read as dim grey, not pure black.
  scene.add(new THREE.AmbientLight(0x4a4f5e, 0.6));
  // Sun: aimed from the Earth/launch side (-x, up, +z) so the Moon's Earth-facing
  // hemisphere — the side you warp to and descend onto — is lit, and Earth's launch
  // pole is lit too. Warm, bright.
  const sun = new THREE.DirectionalLight(0xfff5e8, 2.2);
  sun.position.set(-0.4, 0.6, 0.5).normalize();
  scene.add(sun);

  return bodies.map((body) => {
    const geo = new THREE.SphereGeometry(body.radius, 64, 48);
    const mat = new THREE.MeshStandardMaterial({
      color: BODY_COLORS[body.name] ?? 0x808080,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { body, mesh };
  });
}

export function updateBodies(views: BodyView[], fo: FloatingOrigin): void {
  for (const view of views) {
    const p = toRender(fo, view.body.position);
    view.mesh.position.set(p.x, p.y, p.z);
  }
}
