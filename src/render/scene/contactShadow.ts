// src/render/scene/contactShadow.ts
// A soft dark blob laid flat on the ground under the ship (and, a second
// smaller instance, under the astronaut on foot) — a cheap stand-in for a
// real drop shadow that reads clearly against the toon surfaces. Like the
// dust puffs, this is a sanctioned soft-edge canvas sprite (radial
// gradient, LinearFilter default) rather than a hard-edged toon mesh: a
// contact shadow reads as a shadow precisely because its edge is soft.
//
// Implemented as a textured plane (not a THREE.Sprite) because a Sprite
// always billboards to face the camera — wrong for a shadow, which must
// lie flat on the surface, oriented to the local `up`.
import * as THREE from "three";

const FADE_ALTITUDE = 40; // m — fully faded above this altitude
const BASE_SCALE = 2.2;
const ALTITUDE_SCALE = 0.06;
const SURFACE_LIFT = 0.06; // m above the surface point, avoids z-fighting
const PLANE_NORMAL = new THREE.Vector3(0, 0, 1); // PlaneGeometry's default face normal

function makeShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(10, 12, 20, 0.45)");
  grad.addColorStop(0.7, "rgba(10, 12, 20, 0.22)");
  grad.addColorStop(1, "rgba(10, 12, 20, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export interface ContactShadow {
  update(
    shipWorldPos: THREE.Vector3,
    surfacePointWorld: THREE.Vector3,
    up: THREE.Vector3,
    altitude: number,
    visible: boolean,
  ): void;
}

// scaleMul lets Game create a second, smaller instance for the astronaut
// (per the brief: "same helper, second instance, smaller scale").
export function createContactShadow(scene: THREE.Scene, scaleMul = 1): ContactShadow {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: makeShadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  scene.add(mesh);

  return {
    // shipWorldPos is accepted for API symmetry with the brief's signature
    // but unused here — the shadow's position is fully determined by
    // surfacePointWorld/up/altitude; it's the caller (Game.frame) that
    // derives those from the ship or astronaut position.
    update(_shipWorldPos, surfacePointWorld, up, altitude, visible): void {
      const shown = visible && altitude <= FADE_ALTITUDE;
      mesh.visible = shown;
      if (!shown) return;
      mesh.position.copy(surfacePointWorld).addScaledVector(up, SURFACE_LIFT);
      mesh.quaternion.setFromUnitVectors(PLANE_NORMAL, up);
      mat.opacity = Math.max(0, Math.min(1, 1 - altitude / FADE_ALTITUDE));
      const scale = (BASE_SCALE + Math.max(0, altitude) * ALTITUDE_SCALE) * scaleMul;
      mesh.scale.set(scale, scale, 1);
    },
  };
}
