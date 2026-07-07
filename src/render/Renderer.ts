import * as THREE from "three";
import { createStarfield, Starfield } from "./scene/bodies";

// Tone mapping: a single obvious constant so the controller can flip between
// ACES / Neutral / revert after a visual checkpoint without hunting for it.
// Known risk: ACES can muddy flat toon colors — land the setting, don't
// retune the palette to compensate.
const TONE_MAPPING = THREE.ACESFilmicToneMapping;
const TONE_MAPPING_EXPOSURE = 1.15;

export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;
  // Device-pixel-ratio ceiling: phones report 3-4x and the fill-rate cost
  // isn't worth it. A field (not a literal) so a later quality setting can
  // lower it.
  private dprCap = 2;
  private readonly starfield: Starfield;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, this.dprCap));
    this.gl.toneMapping = TONE_MAPPING;
    this.gl.toneMappingExposure = TONE_MAPPING_EXPOSURE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b18); // deep navy, not void-black
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1e9);
    this.starfield = createStarfield();
    this.scene.add(this.starfield.group);
    this.resize();
  }

  // CSS height * the pixel ratio actually in effect (post-dprCap) — i.e. the
  // renderer's real framebuffer height, matching THREE's own
  // getDrawingBufferSize() convention that PointsMaterial's sizeAttenuation
  // scale is built from.
  private drawingBufferHeight(): number {
    return window.innerHeight * Math.min(window.devicePixelRatio, this.dprCap);
  }

  // Elapsed seconds since start — mirrors the t/1000 already handed to
  // gravityRings.update so the twinkle stays in lockstep with the frame
  // clock rather than drifting on its own timer.
  updateStarfield(tSec: number): void {
    this.starfield.update(tSec);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h);
    // Re-applied on every resize: some browsers report a changed DPR after a
    // window drags between displays, and setSize alone doesn't pick it up.
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, this.dprCap));
    this.starfield.setDrawingBufferHeight(this.drawingBufferHeight());
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
  }
}
