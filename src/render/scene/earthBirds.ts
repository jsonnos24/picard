// src/render/scene/earthBirds.ts
// A small flock of distant birds near Earth's horizon — hard-edged toon
// silhouettes (three canvas "seagull" frames, NearestFilter) that flap and
// drift slowly around the ship. Ambient and cheap: ~10 sprites sharing three
// textures, gated off the moment you climb past ~500 m so they read as a
// ground-level detail you leave behind on launch.
import * as THREE from "three";
import { prng } from "../../game/feel/prng";
import { birdVisibility, flapFrame, wrapAround, BIRD_TOP_ALT } from "../../game/feel/atmosphere";
import type { AtmoCtx } from "./earthAtmosphere";

const COUNT = 10;
const RING_MIN = 400; // m from the ship (horizontal)
const RING_MAX = 900;
const H_MIN = 30; // m above the surface
const H_MAX = 120;
const DRIFT = 0.05; // rad/s — the whole flock sweeps slowly across the horizon
const FLAP_RATE = 3.2; // wing-beats scale
const BIRD_HEX = "#26303c";

// One "seagull" frame: a shallow double-hump whose wing raise sets the flap pose.
function makeBirdTexture(wingRaise: number): THREE.CanvasTexture {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const mid = 26;
  ctx.strokeStyle = BIRD_HEX;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(6, mid);
  ctx.quadraticCurveTo(15, mid - wingRaise, 24, mid);
  ctx.quadraticCurveTo(33, mid - wingRaise, 42, mid);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

interface Bird {
  angle: number; // base angle around the ship
  radius: number;
  height: number;
  phase: number; // flap + bob phase offset
  size: number;
}

export function createEarthBirds(scene: THREE.Scene): { update(ctx: AtmoCtx): void } {
  const frames = [makeBirdTexture(2), makeBirdTexture(7), makeBirdTexture(12)];
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const rng = prng(0xb1d5);
  const birds: Bird[] = [];
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < COUNT; i++) {
    birds.push({
      angle: rng() * Math.PI * 2,
      radius: RING_MIN + rng() * (RING_MAX - RING_MIN),
      height: H_MIN + rng() * (H_MAX - H_MIN),
      phase: rng() * 100,
      size: 40 + rng() * 45,
    });
    const mat = new THREE.SpriteMaterial({ map: frames[1], transparent: true, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    group.add(sprite);
    sprites.push(sprite);
  }

  let flock = 0;
  const tA = new THREE.Vector3();
  const tB = new THREE.Vector3();
  const ref = new THREE.Vector3();

  return {
    update(ctx: AtmoCtx): void {
      const vis = ctx.isEarth ? birdVisibility(ctx.altitude) : 0;
      if (vis <= 0.002 || ctx.altitude >= BIRD_TOP_ALT) {
        group.visible = false;
        return;
      }
      group.visible = true;
      flock = wrapAround(flock + DRIFT * ctx.dt, Math.PI);

      ref.set(Math.abs(ctx.up.x) > 0.9 ? 0 : 1, 0, Math.abs(ctx.up.x) > 0.9 ? 1 : 0);
      tA.copy(ref).addScaledVector(ctx.up, -ref.dot(ctx.up)).normalize();
      tB.crossVectors(ctx.up, tA);

      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        const sprite = sprites[i];
        const a = b.angle + flock;
        const bob = Math.sin(ctx.tSec * 0.6 + b.phase) * 6;
        sprite.material.map = frames[flapFrame(ctx.tSec * FLAP_RATE + b.phase, 3)];
        sprite.material.opacity = vis * 0.55;
        sprite.scale.setScalar(b.size);
        sprite.position
          .copy(ctx.surfacePoint)
          .addScaledVector(tA, Math.cos(a) * b.radius)
          .addScaledVector(tB, Math.sin(a) * b.radius)
          .addScaledVector(ctx.up, b.height + bob);
      }
    },
  };
}
