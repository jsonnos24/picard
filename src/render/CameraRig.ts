import * as THREE from "three";
import { fovForSpeed } from "../game/feel/fov";
import { shakeOffset, gLeanOffset } from "../game/feel/shake";
import { AngularState } from "../game/feel/turning";

// First-person: camera sits where the cockpit is and shares the ship's orientation.
export class CameraRig {
  private downView = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private currentFov = 70;

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

  setCockpit(
    shipRenderPos: THREE.Vector3,
    shipQuat: THREE.Quaternion,
    speed: number,
    accelMag: number,
    angular: AngularState,
    t: number,
  ): void {
    this.camera.position.copy(shipRenderPos);
    this.camera.quaternion.copy(shipQuat);
    const tilt = this.downView ? -Math.PI / 2 : Math.PI / 2;
    this.camera.rotateX(tilt);
    this.camera.rotateY(this.lookYaw);
    this.camera.rotateX(this.lookPitch);

    // Camera-local shake + g-lean (translateX/Y/Z move along the camera's own axes).
    const sh = shakeOffset(speed, accelMag, t);
    const lean = gLeanOffset(angular);
    this.camera.translateX(sh.x + lean.x);
    this.camera.translateY(sh.y + lean.y);
    this.camera.translateZ(sh.z + lean.z);

    const targetFov = fovForSpeed(speed);
    this.currentFov += (targetFov - this.currentFov) * 0.08;
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }
}
