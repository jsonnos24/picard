import * as THREE from "three";
import { fovForSpeed, FOV_BASE } from "../game/feel/fov";
import { shakeOffset, gLeanOffset, Offset } from "../game/feel/shake";
import { AngularState } from "../game/feel/turning";
import { chaseFrame, smoothToward, SlingView, GroundView } from "../game/feel/chase";
import { Vec3 } from "../sim/Vec3";

export type CameraMode = "chase" | "cockpit";

// Chase (default): swoopy third-person framing that shows off the toon ship.
// Cockpit: camera sits where the cockpit is and shares the ship's orientation.
export class CameraRig {
  mode: CameraMode = "chase";
  private downView = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private currentFov = FOV_BASE;
  private chasePos: Vec3 | null = null; // smoothed chase state
  private chaseLook: Vec3 | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  toggleMode(): void {
    this.mode = this.mode === "chase" ? "cockpit" : "chase";
    this.chasePos = null; // re-seed the smoothing on next chase frame
    this.chaseLook = null;
  }

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

    this.applyFov(speed, warpFovScale);
  }

  setChase(
    shipRenderPos: THREE.Vector3,
    shipQuat: THREE.Quaternion,
    speed: number,
    dt: number,
    sling: SlingView | null,
    ground: GroundView | null,
    warpFovScale = 1,
    shake: Offset | null = null,
  ): void {
    const fwd3 = new THREE.Vector3(0, 1, 0).applyQuaternion(shipQuat); // nose
    const up3 = new THREE.Vector3(0, 0, 1).applyQuaternion(shipQuat); // matches cockpit-up
    const ship = new Vec3(shipRenderPos.x, shipRenderPos.y, shipRenderPos.z);
    const frame = chaseFrame(
      ship,
      new Vec3(fwd3.x, fwd3.y, fwd3.z),
      new Vec3(up3.x, up3.y, up3.z),
      speed,
      sling,
      ground,
    );
    this.chasePos = this.chasePos ? smoothToward(this.chasePos, frame.camPos, 6, dt) : frame.camPos;
    this.chaseLook = this.chaseLook
      ? smoothToward(this.chaseLook, frame.lookAt, 10, dt)
      : frame.lookAt;
    this.camera.position.set(this.chasePos.x, this.chasePos.y, this.chasePos.z);
    // While slung, the swing-plane normal keeps the orbit cam from rolling —
    // ship-up spins with the rail tangent every lap. Near the ground,
    // planet-up keeps the horizon level; in space, ship-up.
    if (sling) {
      this.camera.up.set(sling.normal.x, sling.normal.y, sling.normal.z);
    } else if (ground && frame.groundness > 0) {
      const pu = new THREE.Vector3(ground.up.x, ground.up.y, ground.up.z);
      this.camera.up.copy(up3.lerp(pu, frame.groundness).normalize());
    } else {
      this.camera.up.copy(up3);
    }
    this.camera.lookAt(this.chaseLook.x, this.chaseLook.y, this.chaseLook.z);
    // Camera-local judder, same translate-after-look pattern as setCockpit —
    // nudges position along the just-computed orientation's own axes so the
    // shake reads as a jitter on the shot rather than a fight with the smoothing.
    if (shake) {
      this.camera.translateX(shake.x);
      this.camera.translateY(shake.y);
      this.camera.translateZ(shake.z);
    }
    this.applyFov(speed, warpFovScale);
  }

  private applyFov(speed: number, warpFovScale: number): void {
    const targetFov = fovForSpeed(speed) * warpFovScale;
    // warpFovScale is exactly 1 only when no lightspeed sequence is active; during
    // one it is never exactly 1, so this engages faster FOV smoothing throughout.
    const smoothing = warpFovScale !== 1 ? 0.5 : 0.08;
    this.currentFov += (targetFov - this.currentFov) * smoothing;
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }
}
