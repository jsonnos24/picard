import * as THREE from "three";
import { Body } from "../../sim/Body";
import { toRender, FloatingOrigin } from "../../sim/FloatingOrigin";
import { toonMaterial, addOutline } from "../toon";
import { prng } from "../../game/feel/prng";
import {
  generateStars,
  generateBand,
  bandNormal,
  orthonormalBasis,
  STAR_TINTS,
  StarField,
} from "../../game/feel/starfieldSpec";
import { createStarfieldMaterial } from "./starfieldMaterial";
import { surfaceSpec } from "../../game/feel/planetSurface";
import { paintSurface, paintRingTexture } from "./planetTexture";
import { createAtmosphereRim } from "./atmosphereRim";
import { createSunGlow, SunGlow } from "./sunGlow";

// Same overall scale as the old flat starfield — nothing else about the
// scene should need to change.
const STARFIELD_RADIUS = 5e8;
const MAIN_COUNT = 3000;
const BAND_COUNT = 1500;
// Fixed seeds: the sky is part of the scene's identity, not randomized per
// run (a reload shouldn't rearrange the stars).
const MAIN_SEED = 20260706;
const BAND_SEED = 918273;

export interface Starfield {
  group: THREE.Group;
  update(tSec: number): void;
  // Mirrors THREE.PointsMaterial's own sizeAttenuation "scale" uniform
  // convention: pass drawingBufferHeight (CSS height * devicePixelRatio, i.e.
  // the renderer's actual framebuffer height) and this derives uScale =
  // drawingBufferHeight * 0.5, so stars keep a consistent apparent size
  // across window resizes and DPR. Call on init and on every resize.
  setDrawingBufferHeight(height: number): void;
}

// Two nebula hues along the band, alternated; canvas radial-gradient
// textures kept as render glue (the spec module stays Three-free).
const NEBULA_HUES = ["#4a5a9a", "#7a4a8a"];
const NEBULA_COUNT = 4;

function makeNebulaTexture(hex: string, peakAlpha: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = new THREE.Color(hex);
  const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${peakAlpha})`);
  grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${peakAlpha * 0.4})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// A handful of huge soft glows along the band's great circle — dust-lane
// color, not readable as individual objects.
function createNebula(seed: number, radius: number): THREE.Sprite[] {
  const normal = bandNormal(seed);
  const { u, v } = orthonormalBasis(normal);
  const rng = prng(seed ^ 0x5eed);
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < NEBULA_COUNT; i++) {
    const angle = (i / NEBULA_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const x = Math.cos(angle) * u[0] + Math.sin(angle) * v[0];
    const y = Math.cos(angle) * u[1] + Math.sin(angle) * v[1];
    const z = Math.cos(angle) * u[2] + Math.sin(angle) * v[2];
    const hue = NEBULA_HUES[i % NEBULA_HUES.length];
    const alpha = 0.05 + rng() * 0.03; // peak 0.05-0.08
    const mat = new THREE.SpriteMaterial({
      map: makeNebulaTexture(hue, alpha),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x * radius * 0.9, y * radius * 0.9, z * radius * 0.9);
    sprite.scale.setScalar(radius * 0.4);
    sprites.push(sprite);
  }
  return sprites;
}

interface StarAttributes {
  positions: Float32Array;
  sizes: Float32Array;
  colors: Float32Array;
  phases: Float32Array;
  amps: Float32Array;
}

function fillAttributes(
  target: StarAttributes,
  field: StarField,
  offset: number,
  count: number,
  radius: number,
  tintColors: THREE.Color[],
): void {
  for (let i = 0; i < count; i++) {
    const si = offset + i;
    target.positions[si * 3] = field.positions[i * 3] * radius;
    target.positions[si * 3 + 1] = field.positions[i * 3 + 1] * radius;
    target.positions[si * 3 + 2] = field.positions[i * 3 + 2] * radius;
    target.sizes[si] = field.sizes[i];
    const c = tintColors[field.colorIndex[i]];
    target.colors[si * 3] = c.r;
    target.colors[si * 3 + 1] = c.g;
    target.colors[si * 3 + 2] = c.b;
    target.phases[si] = field.twinklePhase[i];
    target.amps[si] = field.twinkleAmp[i];
  }
}

export function createStarfield(): Starfield {
  const main = generateStars(MAIN_SEED, MAIN_COUNT);
  const band = generateBand(BAND_SEED, BAND_COUNT);
  const total = MAIN_COUNT + BAND_COUNT;
  const tintColors = STAR_TINTS.map((hex) => new THREE.Color(hex));

  const attrs: StarAttributes = {
    positions: new Float32Array(total * 3),
    sizes: new Float32Array(total),
    colors: new Float32Array(total * 3),
    phases: new Float32Array(total),
    amps: new Float32Array(total),
  };

  fillAttributes(attrs, main, 0, MAIN_COUNT, STARFIELD_RADIUS, tintColors);
  fillAttributes(attrs, band, MAIN_COUNT, BAND_COUNT, STARFIELD_RADIUS, tintColors);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(attrs.positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(attrs.sizes, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(attrs.colors, 3));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(attrs.phases, 1));
  geo.setAttribute("aAmp", new THREE.BufferAttribute(attrs.amps, 1));

  const material = createStarfieldMaterial();
  const points = new THREE.Points(geo, material);

  const group = new THREE.Group();
  group.add(points);
  for (const sprite of createNebula(BAND_SEED, STARFIELD_RADIUS)) group.add(sprite);

  return {
    group,
    update(tSec: number): void {
      material.uniforms.uTime.value = tSec;
    },
    setDrawingBufferHeight(height: number): void {
      material.uniforms.uScale.value = height * 0.5;
    },
  };
}

export interface BodyView {
  body: Body;
  mesh: THREE.Mesh;
  outline?: THREE.Mesh;
  rim?: THREE.Mesh;
  spinRate?: number; // rad/s, render-only (see updateBodies)
  sunGlow?: SunGlow;
}

// Render-side per-name config — NOT sim fields (sim's Body only carries a
// flat `color` hint; everything below is purely cosmetic and belongs here,
// per the Phase C2 brief).

const GAS_GIANTS = new Set(["Jupiter", "Saturn", "Uranus", "Neptune"]);

// Gas giants spin fastest, rocky planets slower, the tidally-locked-reading
// Moon slowest of all. The Sun doesn't spin here (its "life" comes from the
// layered glow instead — see createSunGlow).
function spinRateFor(body: Body): number {
  if (body.kind === "star") return 0;
  if (body.name === "Moon") return 0.004;
  if (GAS_GIANTS.has(body.name)) return 0.02;
  return 0.008;
}

function paleTint(hex: number, amount = 0.55): number {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), amount).getHex();
}

// Atmosphere rim tint per body — only bodies with a readable atmosphere in
// this cartoon's fiction get one (rocky bodies with air + the gas giants);
// airless Mercury/Moon never get a rim.
const ATMOSPHERE_TINTS: Record<string, number> = {
  Earth: 0x6fc0ff,
  Mars: 0xe8a06a,
  Venus: 0xf0d890,
  Jupiter: paleTint(0xe8a15c),
  Saturn: paleTint(0xf0cf8b),
  Uranus: paleTint(0x7fd4e0),
  Neptune: paleTint(0x4f7bff),
};

// Fixed, non-random seed base: surface painting must be identical every run
// (reload shouldn't repaint continents in new places), but still vary
// per-body — hashed together with the body's name.
const SURFACE_SEED_BASE = 0x9e3779b9;

function seedFromName(name: string): number {
  let h = SURFACE_SEED_BASE >>> 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function hexColorString(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
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
    if (body.kind !== "star") {
      // Surface painting happens once, here, at startup — never per frame.
      const spec = surfaceSpec(body.name, seedFromName(body.name), hexColorString(body.color));
      const canvas = paintSurface(spec);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      (mat as THREE.MeshToonMaterial).map = tex;
    }
    const mesh = new THREE.Mesh(geo, mat);
    let outline: THREE.Mesh | undefined;
    let rim: THREE.Mesh | undefined;
    let sunGlow: SunGlow | undefined;
    if (body.kind === "star") {
      // Sunlight radiates from the star itself; no-falloff so the outer planets
      // read just as brightly (cartoon, not photometry).
      const light = new THREE.PointLight(0xfff5e8, 2.2, 0, 0);
      mesh.add(light);
      sunGlow = createSunGlow(body.radius);
      mesh.add(sunGlow.group);
    } else {
      outline = addOutline(mesh, 1.02);
      const tint = ATMOSPHERE_TINTS[body.name];
      if (tint !== undefined) {
        rim = createAtmosphereRim(body.radius, tint);
        mesh.add(rim);
      }
    }
    if (body.rings) {
      const ringGeo = new THREE.RingGeometry(body.rings.inner, body.rings.outer, 64);
      const ringTex = new THREE.CanvasTexture(paintRingTexture());
      ringTex.colorSpace = THREE.SRGBColorSpace;
      const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const rings = new THREE.Mesh(ringGeo, ringMat);
      rings.rotation.x = -Math.PI / 2; // lie in the ecliptic
      mesh.add(rings);
    }
    scene.add(mesh);
    return { body, mesh, outline, rim, spinRate: spinRateFor(body), sunGlow };
  });
}

export function updateBodies(
  views: BodyView[],
  fo: FloatingOrigin,
  dtSec: number,
  tSec: number,
  cameraPos?: THREE.Vector3,
): void {
  for (const view of views) {
    const p = toRender(fo, view.body.position);
    view.mesh.position.set(p.x, p.y, p.z);
    if (view.spinRate) view.mesh.rotation.y += view.spinRate * dtSec;
    if (view.sunGlow) view.sunGlow.update(tSec);
    if (cameraPos) {
      const dist = view.mesh.position.distanceTo(cameraPos);
      // The ink line and atmosphere rim are planet-scale shells — hide them
      // together while the camera is near/inside, or they swallow the whole
      // sky at ground level.
      const visible = dist > view.body.radius * 1.25;
      if (view.outline) view.outline.visible = visible;
      if (view.rim) view.rim.visible = visible;
    }
  }
}
