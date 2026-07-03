import * as THREE from "three";
import { Body } from "../../sim/Body";
import { toRender, FloatingOrigin } from "../../sim/FloatingOrigin";
import { toonMaterial, addOutline } from "../toon";

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

// A soft radial glow sprite for the Sun, drawn once onto a canvas.
function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 230, 140, 0.9)");
  grad.addColorStop(0.4, "rgba(255, 190, 80, 0.35)");
  grad.addColorStop(1, "rgba(255, 160, 40, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createBodies(scene: THREE.Scene, bodies: Body[]): BodyView[] {
  // Lifted ambient: toon shading wants readable shadow bands, not black.
  scene.add(new THREE.AmbientLight(0x5a6080, 0.9));

  return bodies.map((body) => {
    const geo = new THREE.SphereGeometry(body.radius, 48, 32);
    const mat =
      body.kind === "star"
        ? // The Sun glows on its own — unlit, and it carries the scene's light.
          new THREE.MeshBasicMaterial({ color: body.color })
        : toonMaterial(body.color);
    const mesh = new THREE.Mesh(geo, mat);
    if (body.kind === "star") {
      // Sunlight radiates from the star itself; no-falloff so the outer planets
      // read just as brightly (cartoon, not photometry).
      const light = new THREE.PointLight(0xfff5e8, 2.2, 0, 0);
      mesh.add(light);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeGlowTexture(),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.setScalar(body.radius * 7);
      mesh.add(glow);
    } else {
      addOutline(mesh, 1.02);
    }
    if (body.rings) {
      const ringGeo = new THREE.RingGeometry(body.rings.inner, body.rings.outer, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe8d9a8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const rings = new THREE.Mesh(ringGeo, ringMat);
      rings.rotation.x = -Math.PI / 2; // lie in the ecliptic
      mesh.add(rings);
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
