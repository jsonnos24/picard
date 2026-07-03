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

export function createBodies(scene: THREE.Scene, bodies: Body[]): BodyView[] {
  // Soft fill so shadowed hemispheres read as dim grey, not pure black.
  scene.add(new THREE.AmbientLight(0x4a4f5e, 0.6));

  return bodies.map((body) => {
    const geo = new THREE.SphereGeometry(body.radius, 64, 48);
    const mat =
      body.kind === "star"
        ? // The Sun glows on its own — unlit, and it carries the scene's light.
          new THREE.MeshBasicMaterial({ color: body.color })
        : new THREE.MeshStandardMaterial({ color: body.color, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    if (body.kind === "star") {
      // Sunlight radiates from the star itself; no-falloff so the outer planets
      // read just as brightly (cartoon, not photometry).
      const light = new THREE.PointLight(0xfff5e8, 2.2, 0, 0);
      mesh.add(light);
    }
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
