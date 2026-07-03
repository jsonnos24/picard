import * as THREE from "three";

// Toon shading kit: a shared stepped gradient map, MeshToonMaterial factory,
// and inverted-hull outlines. No post-processing — one cheap extra draw per
// outlined mesh keeps phones happy.

const gradientCache = new Map<number, THREE.DataTexture>();

export function makeGradientMap(steps = 3): THREE.DataTexture {
  const cached = gradientCache.get(steps);
  if (cached) return cached;
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round(70 + (i / (steps - 1)) * 185); // 70..255: lifted shadows
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  gradientCache.set(steps, tex);
  return tex;
}

export function toonMaterial(color: number, steps = 3): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: makeGradientMap(steps) });
}

export const OUTLINE_COLOR = 0x10121e;

// Inverted hull: same geometry, back faces only, slightly inflated.
export function addOutline(mesh: THREE.Mesh, scale = 1.03, color = OUTLINE_COLOR): THREE.Mesh {
  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
  );
  outline.scale.setScalar(scale);
  mesh.add(outline);
  return outline;
}
