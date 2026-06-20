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

  applyLook(camera: THREE.PerspectiveCamera): void {
    camera.rotateY(this.lookYaw);
    camera.rotateX(this.lookPitch);
  }

  setCockpit(shipRenderPos: THREE.Vector3, shipQuat: THREE.Quaternion): void {
    this.camera.position.copy(shipRenderPos);
    this.camera.quaternion.copy(shipQuat);
    // Cockpit looks along the ship's local +Y (thrust/nose up). Tilt to look "forward"
    // by rotating -90deg about local X so the pilot looks along +Y horizon, or straight
    // down when downView is on.
    const tilt = this.downView ? 0 : -Math.PI / 2;
    this.camera.rotateX(tilt);
    this.camera.rotateY(this.lookYaw);
    this.camera.rotateX(this.lookPitch);
  }
}
