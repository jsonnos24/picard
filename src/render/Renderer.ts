import * as THREE from "three";
import { createStarfield, Starfield } from "./scene/bodies";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// Tone mapping: a single obvious constant so the controller can flip between
// ACES / Neutral / revert after a visual checkpoint without hunting for it.
// Known risk: ACES can muddy flat toon colors — land the setting, don't
// retune the palette to compensate.
const TONE_MAPPING = THREE.ACESFilmicToneMapping;
const TONE_MAPPING_EXPOSURE = 1.15;

// Bloom spike (Phase D2): a subtle glow, not a full HDR bloom look — the Sun
// sprite and warp flash/tunnel already carry the "glow" read from C1/C2, this
// just lets bright fragments spill a little. Brief-specified constants.
const BLOOM_STRENGTH = 0.55;
const BLOOM_RADIUS = 0.4;
const BLOOM_THRESHOLD = 0.85;

export type QualityTier = "high" | "low";

export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;
  // Device-pixel-ratio ceiling: phones report 3-4x and the fill-rate cost
  // isn't worth it. A field (not a literal) so a later quality setting can
  // lower it.
  private dprCap = 2;
  private readonly starfield: Starfield;
  // Composer chain: RenderPass → UnrealBloomPass → OutputPass. RenderPass and
  // the bloom pass write into an offscreen target and so render fully linear,
  // untouched by tone mapping/color-space encoding (Three only applies those
  // when the bound render target is the screen); OutputPass is the one pass
  // that targets the screen, and it's the sole place toneMapping/ACES gets
  // applied — so "low" tier (gl.render straight to the canvas, no composer)
  // and "high" tier with a dark/non-bloomed scene tone-map identically.
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private tier: QualityTier = "high";

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

    // Replacing direct-to-canvas with a composer target drops the implicit
    // MSAA the canvas context's own antialias:true gave us — restored
    // explicitly here via samples on the composer's render target.
    const w = window.innerWidth;
    const h = window.innerHeight;
    const renderTarget = new THREE.WebGLRenderTarget(w, h, {
      samples: 4,
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(this.gl, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

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
    const ratio = Math.min(window.devicePixelRatio, this.dprCap);
    this.gl.setPixelRatio(ratio);
    // Composer's own setSize multiplies by whatever pixel ratio it was last
    // told about, so the ratio has to be re-applied here too (mirrors the
    // renderer.setPixelRatio call directly above) before setSize scales it in.
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.starfield.setDrawingBufferHeight(this.drawingBufferHeight());
  }

  // Runtime switch (settings panel later): "high" runs the bloom composer,
  // "low" renders straight to the canvas — no composer overhead at all, not
  // just bloom disabled. Sun sprites already carry the glow look at low tier.
  setQualityTier(tier: QualityTier): void {
    this.tier = tier;
  }

  render(): void {
    if (this.tier === "high") this.composer.render();
    else this.gl.render(this.scene, this.camera);
  }
}
