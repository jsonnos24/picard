// src/game/feel/puff.ts
// Pure kinematics for a landing-dust burst: a handful of particles thrown
// outward from the touchdown point in an upward-biased hemisphere, dragged
// to a stop, and shrunk to nothing over a short life. No Three.js — the
// render glue (src/render/scene/dust.ts) turns these into billboarded
// sprites oriented to the local surface tangent frame.
import { prng } from "./prng";

export interface PuffParticle {
  px: number; // unit direction, local frame (+Y-biased hemisphere)
  py: number;
  pz: number;
  dist: number; // metres travelled outward along (px,py,pz) so far
  speed: number; // current outward speed, m/s — decays via drag
  size: number; // current visual size, m — grows then shrinks over life
  baseSize: number; // peak size this particle reaches
  tone: 0 | 1; // which of the two dust-tone textures to draw
  life: number; // seconds remaining
  maxLife: number; // seconds — this particle's total lifespan
}

const DRAG_TAU = 0.5; // s — speed decay time constant
const BASE_SPEED = 6; // m/s baseline outward speed before intensity scale
const BASE_SIZE = 1.4; // m baseline peak size before intensity scale
const BASE_LIFE = 0.9; // s baseline lifespan
const GROW_FRAC = 0.3; // fraction of life spent growing before it shrinks

// Outward radial velocity with an upward bias, speed/size scaling with
// intensity (soft=0.5, hard=1, crash=1.5 per the caller's convention).
export function spawnPuff(seed: number, n: number, intensity: number): PuffParticle[] {
  const rand = prng(seed);
  const particles: PuffParticle[] = [];
  for (let i = 0; i < n; i++) {
    const py = 0.3 + rand() * 0.7; // always in the upper hemisphere
    const horizR = Math.sqrt(Math.max(0, 1 - py * py));
    const ang = rand() * Math.PI * 2;
    const px = Math.cos(ang) * horizR;
    const pz = Math.sin(ang) * horizR;
    const speed = BASE_SPEED * intensity * (0.6 + rand() * 0.8);
    const baseSize = BASE_SIZE * intensity * (0.7 + rand() * 0.6);
    const maxLife = BASE_LIFE * (0.8 + rand() * 0.4);
    const tone: 0 | 1 = rand() < 0.5 ? 0 : 1;
    particles.push({ px, py, pz, dist: 0, speed, size: 0, baseSize, tone, life: maxLife, maxLife });
  }
  return particles;
}

// Drag, life countdown, and a grow-then-shrink size curve. Particles whose
// life has run out are dropped from the returned array.
export function stepPuff(particles: PuffParticle[], dt: number): PuffParticle[] {
  if (dt <= 0) return particles;
  const dragK = Math.exp(-dt / DRAG_TAU);
  const next: PuffParticle[] = [];
  for (const p of particles) {
    const life = p.life - dt;
    if (life <= 0) continue;
    const dist = p.dist + p.speed * dt;
    const speed = p.speed * dragK;
    const ageFrac = 1 - life / p.maxLife; // 0 at spawn -> 1 at death
    const curve =
      ageFrac < GROW_FRAC ? ageFrac / GROW_FRAC : Math.max(0, 1 - (ageFrac - GROW_FRAC) / (1 - GROW_FRAC));
    const size = p.baseSize * curve;
    next.push({ ...p, dist, speed, size, life });
  }
  return next;
}
