// src/render/scene/earthClouds.ts
// Drifting cloud puffs over Earth, in two layers you punch through on launch.
// Pooled billboard Sprites sharing a soft radial-gradient canvas texture (the
// dust.ts pattern; soft gradients are sanctioned for sprites). Anchored to the
// surface point under the ship, scattered on a tangent plane, drifting on the
// wind and wrapping endlessly. Each layer stays full while you're below it and
// fades once you climb past it (cloudLayerOpacity) — so on the ground you see a
// full sky of clouds, and on launch they stream by and recede layer by layer.
import * as THREE from "three";
import { prng } from "../../game/feel/prng";
import { cloudLayerOpacity, wrapAround } from "../../game/feel/atmosphere";
import type { AtmoCtx } from "./earthAtmosphere";

const HALF = 1700; // m — half-width of the scatter box (wrap span)
const WIND = 14; // m/s lateral drift
const EDGE_FADE = 0.18; // fraction of HALF over which puffs fade at the wrap seam
const CLOUD_HEX = "#cdd8e4"; // just under the 0.85 bloom threshold — a soft halo, never a blowout
const TOP_ALT = 3000; // gate off at the space threshold

interface Puff {
  u: number; // base tangent offset (drifts + wraps)
  v: number;
  height: number; // metres above the surface (its layer)
  band: number; // fade distance once climbed above
  size: number; // sprite scale (m)
  alpha: number; // per-puff peak opacity
}

const LAYERS = [
  { count: 22, hMin: 150, hMax: 400, band: 320, sizeMin: 220, sizeMax: 420 },
  { count: 18, hMin: 800, hMax: 1500, band: 700, sizeMin: 300, sizeMax: 520 },
];

function makeCloudTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = new THREE.Color(CLOUD_HEX);
  const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
  grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.55)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createEarthClouds(scene: THREE.Scene): { update(ctx: AtmoCtx): void } {
  const texture = makeCloudTexture();
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const rng = prng(0x0cd0); // deterministic scatter
  const puffs: Puff[] = [];
  const sprites: THREE.Sprite[] = [];
  for (const L of LAYERS) {
    for (let i = 0; i < L.count; i++) {
      puffs.push({
        u: (rng() * 2 - 1) * HALF,
        v: (rng() * 2 - 1) * HALF,
        height: L.hMin + rng() * (L.hMax - L.hMin),
        band: L.band,
        size: L.sizeMin + rng() * (L.sizeMax - L.sizeMin),
        alpha: 0.55 + rng() * 0.25,
      });
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      group.add(sprite);
      sprites.push(sprite);
    }
  }

  let drift = 0;
  const tA = new THREE.Vector3();
  const tB = new THREE.Vector3();
  const ref = new THREE.Vector3();

  return {
    update(ctx: AtmoCtx): void {
      if (!ctx.isEarth || ctx.altitude >= TOP_ALT) {
        group.visible = false;
        return;
      }
      group.visible = true;
      drift = wrapAround(drift + WIND * ctx.dt, HALF);

      // Tangent basis at the surface point under the ship.
      ref.set(Math.abs(ctx.up.x) > 0.9 ? 0 : 1, 0, Math.abs(ctx.up.x) > 0.9 ? 1 : 0);
      tA.copy(ref).addScaledVector(ctx.up, -ref.dot(ctx.up)).normalize();
      tB.crossVectors(ctx.up, tA);

      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        const sprite = sprites[i];
        const u = wrapAround(p.u + drift, HALF);
        // Fade near the wrap seam so recycled puffs don't pop in/out.
        const edge = Math.min(1, (HALF - Math.abs(u)) / (HALF * EDGE_FADE));
        const op = cloudLayerOpacity(ctx.altitude, p.height, p.band) * p.alpha * Math.max(0, edge);
        if (op <= 0.002) {
          sprite.visible = false;
          continue;
        }
        sprite.visible = true;
        sprite.material.opacity = op;
        sprite.scale.setScalar(p.size);
        sprite.position
          .copy(ctx.surfacePoint)
          .addScaledVector(tA, u)
          .addScaledVector(tB, p.v)
          .addScaledVector(ctx.up, p.height);
      }
    },
  };
}
