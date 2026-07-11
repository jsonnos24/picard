// src/render/scene/earthSky.ts
// The blue sky you see from Earth's ground: a big BackSide sphere pinned to the
// camera with a baked zenith→horizon→navy vertex gradient. Fades out as you
// climb (skyFactor) so the fade itself IS the "sky opens to space" transition.
//
// A vertex-colored stock MeshBasicMaterial is deliberate: Three auto-injects
// the logarithmic-depth chunks the renderer needs, so no custom shader to
// hand-maintain (unlike atmosphereRim.ts). depthWrite:false + a radius well
// inside the starfield shell (5e8) but outside all local geometry means the
// dome always draws BEHIND the scene and IN FRONT of the stars — opaque blue
// hides the stars at ground level, and they reappear as opacity → 0.
import * as THREE from "three";
import { skyFactor, SKY_TOP_ALT } from "../../game/feel/atmosphere";
import type { AtmoCtx } from "./earthAtmosphere";

const RADIUS = 2e5;
const LOCAL_UP = new THREE.Vector3(0, 1, 0);

// All kept < 0.85 luminance so the sky never trips the bloom threshold. The
// zenith runs deep/saturated because ACES tone mapping lifts and desaturates
// blues — a lighter zenith washes out to near-white.
const ZENITH = new THREE.Color(0x1f5fbe);
const HORIZON = new THREE.Color(0x9fc6ea);
const NADIR = new THREE.Color(0x0a1428); // below the horizon → blends into space

function bakeGradient(geo: THREE.SphereGeometry): void {
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / RADIUS; // -1 (nadir) .. +1 (zenith)
    if (t >= 0) c.copy(HORIZON).lerp(ZENITH, t);
    else c.copy(HORIZON).lerp(NADIR, -t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

export function createEarthSky(scene: THREE.Scene): { update(ctx: AtmoCtx): void } {
  const geo = new THREE.SphereGeometry(RADIUS, 32, 24);
  bakeGradient(geo);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -10; // draw before scene geometry
  dome.visible = false;
  scene.add(dome);

  return {
    update(ctx: AtmoCtx): void {
      const opacity = ctx.isEarth ? skyFactor(ctx.altitude) : 0;
      if (opacity <= 0.001 || ctx.altitude >= SKY_TOP_ALT) {
        dome.visible = false;
        return;
      }
      dome.visible = true;
      mat.opacity = opacity;
      dome.position.copy(ctx.cameraPos); // skybox: never reach its edge
      dome.quaternion.setFromUnitVectors(LOCAL_UP, ctx.up); // keep zenith "up"
    },
  };
}
