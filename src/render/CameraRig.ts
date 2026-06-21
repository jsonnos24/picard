import * as THREE from "three";
import { fovForSpeed, FOV_BASE } from "../game/feel/fov";
import { shakeOffset, gLeanOffset } from "../game/feel/shake";
import { AngularState } from "../game/feel/turning";

// First-person: camera sits where the cockpit is and shares the ship's orientation.
export class CameraRig {
  private downView = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private currentFov = FOV_BASE;

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
    warpFovScale = 1,
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

    const targetFov = fovForSpeed(speed) * warpFovScale;
    // warpFovScale is exactly 1 only when no warp is active (warpSequence returns literal 1 when idle); during a warp it is never exactly 1, so this engages faster FOV smoothing for the whole sequence.
    const smoothing = warpFovScale !== 1 ? 0.5 : 0.08;
    this.currentFov += (targetFov - this.currentFov) * smoothing;
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }
}
