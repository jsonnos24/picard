import * as THREE from "three";
import { createStarfield } from "./scene/bodies";

export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    // Cap DPR: phones report 3-4x and the fill-rate cost isn't worth it.
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b18); // deep navy, not void-black
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1e9);
    this.scene.add(createStarfield());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h);
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
  }
}
