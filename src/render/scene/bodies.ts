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
  };
}

export interface BodyView {
  body: Body;
  mesh: THREE.Mesh;
  outline?: THREE.Mesh;
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
    let outline: THREE.Mesh | undefined;
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
      outline = addOutline(mesh, 1.02);
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
    return { body, mesh, outline };
  });
}

export function updateBodies(
  views: BodyView[],
  fo: FloatingOrigin,
  cameraPos?: THREE.Vector3,
): void {
  for (const view of views) {
    const p = toRender(fo, view.body.position);
    view.mesh.position.set(p.x, p.y, p.z);
    if (view.outline && cameraPos) {
      // The ink line is a planet-scale shell — hide it while the camera is
      // near/inside it, or it swallows the whole sky at ground level.
      const dist = view.mesh.position.distanceTo(cameraPos);
      view.outline.visible = dist > view.body.radius * 1.25;
    }
  }
}
