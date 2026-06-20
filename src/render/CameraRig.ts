import * as THREE from "three";

// First-person: camera sits where the cockpit is and shares the ship's orientation.
export class CameraRig {
  private downView = false;
  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  toggleDownView(): void {
    this.downView = !this.downView;
  }

  setCockpit(shipRenderPos: THREE.Vector3, shipQuat: THREE.Quaternion): void {
    this.camera.position.copy(shipRenderPos);
    this.camera.quaternion.copy(shipQuat);
    // Cockpit looks along the ship's local +Y (thrust/nose up). Tilt to look "forward"
    // by rotating -90deg about local X so the pilot looks along +Y horizon, or straight
    // down when downView is on.
    const tilt = this.downView ? 0 : -Math.PI / 2;
    this.camera.rotateX(tilt);
  }
}
