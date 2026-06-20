import * as THREE from "three";

// First-person: camera sits where the cockpit is and shares the ship's orientation.
export class CameraRig {
  private downView = false;
  private lookYaw = 0;
  private lookPitch = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  toggleDownView(): void {
    this.downView = !this.downView;
  }

  addLook(dx: number, dy: number): void {
    this.lookYaw -= dx * 0.0022;
    this.lookPitch -= dy * 0.0022;
    this.lookPitch = Math.max(-1.2, Math.min(1.2, this.lookPitch));
  }

  // Recenter the free-look (e.g. after a warp, so the view faces the new heading).
  resetLook(): void {
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  applyLook(camera: THREE.PerspectiveCamera): void {
    camera.rotateY(this.lookYaw);
    camera.rotateX(this.lookPitch);
  }

  setCockpit(shipRenderPos: THREE.Vector3, shipQuat: THREE.Quaternion): void {
    this.camera.position.copy(shipRenderPos);
    this.camera.quaternion.copy(shipQuat);
    // The ship's local +Y is the nose/thrust direction. Look ALONG the nose by default
    // (+90deg about X maps the camera's -Z forward onto +Y) so you see where you're
    // heading and accelerate toward where you look. Down-view (-90deg) looks out the
    // belly (-Y) — toward the planet when you've flipped retrograde to land.
    const tilt = this.downView ? -Math.PI / 2 : Math.PI / 2;
    this.camera.rotateX(tilt);
    this.camera.rotateY(this.lookYaw);
    this.camera.rotateX(this.lookPitch);
  }
}
