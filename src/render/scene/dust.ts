// src/render/scene/dust.ts
// Landing-dust overhaul: billboarded puff sprites (two soft-edged canvas
// dust tones) driven by src/game/feel/puff.ts's kinematics, oriented to the
// surface tangent frame at the touchdown point, plus a flat cartoon shock
// ring for hard/crash impacts. Public API kept compatible with the old
// placeholder's call sites in Game.ts (`puff(at)`), extended with optional
// `up`/`intensity` params that Game.ts's call sites now pass.
import * as THREE from "three";
import { spawnPuff, stepPuff, PuffParticle } from "../../game/feel/puff";

const POOL_SIZE = 56; // sprite pool: within the brief's 40-60 range
const DUST_TONES = ["#cbb9a2", "#a8977f"];
const RING_LIFE = 0.4; // s
const RING_MAX_RADIUS = 8; // m
const RING_HARD_THRESHOLD = 0.9; // intensity >= this spawns the shock ring
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);

// A dust puff's soft edge is a sanctioned canvas radial-gradient sprite
// (unlike the hard-edged toon meshes elsewhere) — LinearFilter (the
// default) is correct here, no NearestFilter.
function makePuffTexture(hex: string): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = new THREE.Color(hex);
  const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
  grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.5)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function countForIntensity(intensity: number): number {
  if (intensity >= 1.4) return POOL_SIZE; // crash
  if (intensity >= RING_HARD_THRESHOLD) return 44; // hard
  return 26; // soft
}

export function createDust(scene: THREE.Scene): {
  puff(at: THREE.Vector3, up?: THREE.Vector3, intensity?: number): void;
  update(dt: number): void;
} {
  const textures = DUST_TONES.map(makePuffTexture);
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({ map: textures[0], transparent: true, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    scene.add(sprite);
    sprites.push(sprite);
  }

  let particles: PuffParticle[] = [];
  let seedCounter = 1;
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3(1, 0, 0);
  const tangentB = new THREE.Vector3(0, 0, 1);
  const scratch = new THREE.Vector3();

  const ringGeo = new THREE.RingGeometry(0.82, 1, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe8dcc4,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.visible = false;
  scene.add(ring);
  let ringAge = Infinity;

  return {
    puff(at: THREE.Vector3, upArg: THREE.Vector3 = WORLD_UP, intensity = 1): void {
      origin.copy(at);
      up.copy(upArg).normalize();
      const ref = Math.abs(up.y) > 0.9 ? WORLD_RIGHT : WORLD_UP;
      tangentA.crossVectors(ref, up).normalize();
      tangentB.crossVectors(up, tangentA).normalize();

      const n = Math.min(POOL_SIZE, countForIntensity(intensity));
      particles = spawnPuff(seedCounter++, n, intensity);

      if (intensity >= RING_HARD_THRESHOLD) {
        ringAge = 0;
        ring.position.copy(origin).addScaledVector(up, 0.05);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
      }
    },
    update(dt: number): void {
      particles = stepPuff(particles, dt);
      for (let i = 0; i < POOL_SIZE; i++) {
        const p = particles[i];
        const sprite = sprites[i];
        if (!p) {
          sprite.visible = false;
          continue;
        }
        sprite.visible = true;
        if (sprite.material.map !== textures[p.tone]) sprite.material.map = textures[p.tone];
        scratch
          .copy(origin)
          .addScaledVector(tangentA, p.px * p.dist)
          .addScaledVector(up, p.py * p.dist)
          .addScaledVector(tangentB, p.pz * p.dist);
        sprite.position.copy(scratch);
        sprite.scale.setScalar(Math.max(0.001, p.size));
        sprite.material.opacity = Math.max(0, Math.min(1, p.life / p.maxLife));
      }

      if (ringAge < RING_LIFE) {
        ringAge += dt;
        const t = Math.min(1, ringAge / RING_LIFE);
        const r = Math.max(0.01, t * RING_MAX_RADIUS);
        ring.scale.set(r, r, 1);
        ring.visible = true;
        ringMat.opacity = 0.55 * (1 - t);
      } else {
        ring.visible = false;
      }
    },
  };
}
