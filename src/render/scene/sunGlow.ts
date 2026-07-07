// src/render/scene/sunGlow.ts
// Layered Sun glow: 3 additive radial-gradient sprites at different scales
// plus 10 flat triangular flare spikes, both with slow independent
// wobble/rotation. Split out of bodies.ts per the Phase C2 brief's "small
// file under render/scene" allowance — bodies.ts just calls createSunGlow
// and forwards its per-frame update.

import * as THREE from "three";

interface SunSpriteConfig {
  hex: string;
  peakAlpha: number;
  scale: number; // multiple of the Sun's own radius
  wobbleRate: number; // rad/s
  phase: number;
}

// core / mid / wide, per the brief.
const SPRITES: SunSpriteConfig[] = [
  { hex: "#fff7d6", peakAlpha: 0.9, scale: 3.2, wobbleRate: 0.7, phase: 0 },
  { hex: "#ffc94d", peakAlpha: 0.35, scale: 6, wobbleRate: 1.1, phase: 1.3 },
  { hex: "#ff8c2e", peakAlpha: 0.15, scale: 10, wobbleRate: 1.7, phase: 2.6 },
];

const SPIKE_COUNT = 10;
const SPIKE_ROT_RATE = 0.02; // rad/s
const SPIKE_COLOR = 0xfff2c0;
const SPIKE_ALPHA = 0.15;

// Same technique as bodies.ts's nebula texture: a radial gradient baked
// once into a small canvas, reused as a Sprite's map.
function makeGlowTexture(hex: string, peakAlpha: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = new THREE.Color(hex);
  const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${peakAlpha})`);
  grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${peakAlpha * 0.4})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// A single BufferGeometry of SPIKE_COUNT thin triangles radiating from the
// center — a cartoon lens-flare star, not a texture, so it can counter-spin.
function makeFlareGeometry(radius: number): THREE.BufferGeometry {
  const innerR = radius * 0.9;
  const outerR = radius * 2.4;
  const halfWidth = (Math.PI / SPIKE_COUNT) * 0.18;
  const positions: number[] = [];
  for (let i = 0; i < SPIKE_COUNT; i++) {
    const angle = (i / SPIKE_COUNT) * Math.PI * 2;
    const a0 = angle - halfWidth;
    const a1 = angle + halfWidth;
    positions.push(
      Math.cos(a0) * innerR, Math.sin(a0) * innerR, 0,
      Math.cos(a1) * innerR, Math.sin(a1) * innerR, 0,
      Math.cos(angle) * outerR, Math.sin(angle) * outerR, 0,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

export interface SunGlow {
  group: THREE.Group;
  update(tSec: number): void;
}

export function createSunGlow(radius: number): SunGlow {
  const group = new THREE.Group();
  const sprites = SPRITES.map((cfg) => {
    const mat = new THREE.SpriteMaterial({
      map: makeGlowTexture(cfg.hex, cfg.peakAlpha),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(radius * cfg.scale);
    group.add(sprite);
    return { sprite, cfg };
  });

  const flares = new THREE.Mesh(
    makeFlareGeometry(radius),
    new THREE.MeshBasicMaterial({
      color: SPIKE_COLOR,
      transparent: true,
      opacity: SPIKE_ALPHA,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  group.add(flares);

  return {
    group,
    update(tSec: number): void {
      for (const { sprite, cfg } of sprites) {
        const wobble = 1 + 0.04 * Math.sin(tSec * cfg.wobbleRate + cfg.phase);
        sprite.scale.setScalar(radius * cfg.scale * wobble);
      }
      flares.rotation.z = tSec * SPIKE_ROT_RATE;
    },
  };
}
