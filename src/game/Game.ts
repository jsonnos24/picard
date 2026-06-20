import * as THREE from "three";
import { Renderer } from "../render/Renderer";
import { createBodies, updateBodies, BodyView } from "../render/scene/bodies";
import { createShip } from "../render/scene/ship";
import { CameraRig } from "../render/CameraRig";
import { createSolarSystem, Body, surfaceGravity } from "../sim/Body";
import {
  Spacecraft,
  createSpacecraft,
  toMotionState,
  applyMotionState,
  burnFuel,
  thrustAccel as shipThrustAccel,
} from "../sim/Spacecraft";
import { shipAccelFn } from "../sim/forces";
import { verletStep } from "../sim/integrator";
import { createTimeControl, advance, TimeControl } from "../sim/TimeControl";
import { FloatingOrigin, createFloatingOrigin, rebase, toRender } from "../sim/FloatingOrigin";
import { Vec3 } from "../sim/Vec3";
import { FIXED_DT } from "../sim/constants";
import { Phase, initialPhase, transition } from "../sim/GameState";
import { createInputManager, InputManager } from "../sim/input/InputManager";
import { selectPrimaryBody } from "./primaryBody";
import { rotateAttitude, thrustDirection } from "./attitude";
import { nextThrottle, shouldHoldOnSurface } from "./shipControl";
import { nextPhase, LAUNCH_CLEAR } from "./phases";
import { evaluateTouchdown } from "./landing";
import { HUD } from "../ui/HUD";
import { NavMap } from "../ui/NavMap";
import { warpTo } from "../sim/WarpDrive";
import { createWarpEffect } from "../render/scene/warpEffect";
import { projectMarker } from "./markers";
import { Astronaut, createAstronaut, stepAstronaut } from "../sim/Astronaut";
import { createAstronaut3D } from "../render/scene/astronaut";

export class Game {
  private readonly renderer: Renderer;
  private readonly rig: CameraRig;
  private readonly bodies: Body[];
  private readonly views: BodyView[];
  private readonly shipGroup: THREE.Group;
  private ship: Spacecraft;
  private quat = new THREE.Quaternion(); // ship orientation
  private fo: FloatingOrigin;
  private tc: TimeControl;
  private input!: InputManager;
  private lastTime = 0;
  private readonly padHeight = 7; // half ship height so legs touch
  private phase: Phase = initialPhase();
  private hud!: HUD;
  private navmap!: NavMap;
  private warpFx!: { play(): void; update(dt: number, cameraPosition?: THREE.Vector3): void };
  private astronaut: Astronaut | null = null;
  private astronautGroup!: THREE.Group;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(this.renderer.camera);
    this.bodies = createSolarSystem();
    this.views = createBodies(this.renderer.scene, this.bodies);
    this.shipGroup = createShip(this.renderer.scene).group;
    this.fo = createFloatingOrigin();
    this.tc = createTimeControl();
    this.input = createInputManager();
    window.addEventListener("keydown", (e) => this.input.handleKey(e.code, true));
    window.addEventListener("keyup", (e) => this.input.handleKey(e.code, false));

    // Spawn on Earth's "north pole" pad (+Y), resting on the surface.
    const earth = this.bodies[0];
    this.ship = createSpacecraft(new Vec3(0, earth.radius + this.padHeight, 0));
    this.ship.orientation = new Vec3(0, 1, 0);

    window.addEventListener("resize", () => this.renderer.resize());
    this.hud = new HUD(document.getElementById("ui")!);
    this.navmap = new NavMap(document.getElementById("ui")!, this.bodies);
    this.warpFx = createWarpEffect(this.renderer.scene);
    this.astronautGroup = createAstronaut3D(this.renderer.scene).group;
  }

  private stepSim(): void {
    if (this.phase === "OnFoot" && this.astronaut) {
      const pb = selectPrimaryBody(this.astronaut.position, this.bodies);
      const dt = 1 / 60;
      // Build a walk direction in the surface tangent from camera-facing + WASD.
      const fwd = new THREE.Vector3();
      this.renderer.camera.getWorldDirection(fwd);
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(pb.up.x, pb.up.y, pb.up.z)).normalize();
      let move = new THREE.Vector3();
      if (this.input.isActive("walkForward")) move.add(fwd);
      if (this.input.isActive("walkBack")) move.sub(fwd);
      if (this.input.isActive("walkLeft")) move.sub(right);
      if (this.input.isActive("walkRight")) move.add(right);
      const walkDir = new Vec3(move.x, move.y, move.z);
      const jump = this.input.isActive("jump");
      this.astronaut = stepAstronaut(this.astronaut, pb.body, walkDir, jump, dt);
      return; // skip ship integration this step
    }

    const dt = FIXED_DT;
    // Attitude + throttle from input.
    this.quat = rotateAttitude(this.quat, this.input, dt);
    this.ship.throttle = nextThrottle(this.ship.throttle, this.input, dt);
    this.ship.orientation = thrustDirection(this.quat);

    const accel = shipAccelFn(this.ship, this.bodies);
    const next = verletStep(toMotionState(this.ship), dt, accel);
    this.ship = applyMotionState(this.ship, next);
    this.ship = burnFuel(this.ship, dt);

    // Landed hold: pin to the surface until thrust can beat gravity.
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    const thrustMag = shipThrustAccel(this.ship).length();
    if (pb.altitude < this.padHeight && shouldHoldOnSurface(thrustMag, surfaceGravity(pb.body))) {
      this.ship.position = pb.body.position.add(pb.up.scale(pb.body.radius + this.padHeight));
      this.ship.velocity = Vec3.zero();
    }

    const atmoTop = pb.body.atmosphere ? pb.body.atmosphere.scaleHeight * 10 : 0;
    this.phase = nextPhase({
      phase: this.phase,
      altitude: pb.altitude,
      inAtmosphere: pb.altitude < atmoTop,
      primaryName: pb.body.name,
      launched: pb.altitude > LAUNCH_CLEAR,
    });

    // Moon touchdown / crash detection while Descending.
    if (this.phase === "Descending") {
      const vUp = this.ship.velocity.dot(pb.up);
      const tilt = Math.acos(Math.max(-1, Math.min(1, this.ship.orientation.normalize().dot(pb.up))));
      const result = evaluateTouchdown(pb.altitude, vUp, tilt, this.padHeight);
      if (result === "landed") {
        this.snapToSurface(pb.body, pb.up, this.padHeight);
        this.phase = transition("Descending", "LandedMoon");
      } else if (result === "crash") {
        this.resetToPad();
      }
    }
  }

  private frame = (t: number): void => {
    const dt = this.lastTime === 0 ? 0 : (t - this.lastTime) / 1000;
    this.lastTime = t;
    if (this.input.consumePressed("openMap")) this.navmap.toggle();
    if (this.input.consumePressed("warp")) this.doWarp();
    if (this.input.consumePressed("toggleExit")) this.toggleExit();
    const { steps, next } = advance(this.tc, Math.min(dt, 0.1));
    this.tc = next;
    for (let i = 0; i < steps; i++) this.stepSim();

    this.fo = rebase(this.fo, this.ship.position);
    updateBodies(this.views, this.fo);

    const shipRender = toRender(this.fo, this.ship.position);
    const shipVec = new THREE.Vector3(shipRender.x, shipRender.y, shipRender.z);
    this.shipGroup.position.copy(shipVec);
    this.shipGroup.quaternion.copy(this.quat);

    if (this.phase === "OnFoot" && this.astronaut) {
      const r = toRender(this.fo, this.astronaut.position);
      const pb = selectPrimaryBody(this.astronaut.position, this.bodies);
      const up = new THREE.Vector3(pb.up.x, pb.up.y, pb.up.z);
      const eye = new THREE.Vector3(r.x, r.y, r.z).add(up.clone().multiplyScalar(1.6));
      this.renderer.camera.position.copy(eye);
      this.renderer.camera.up.copy(up);
      // free-look: let mouse control handled in a later polish step; for now look along surface
      this.astronautGroup.position.set(r.x, r.y, r.z);
      this.astronautGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    } else {
      this.rig.setCockpit(shipVec, this.quat);
    }

    this.navmap.update(this.ship.position);
    this.warpFx.update(dt, this.renderer.camera.position);
    this.updateHud();
    this.updateMarker();
    this.renderer.render();
    requestAnimationFrame(this.frame);
  };

  private initialFuel = 15000;

  private updateHud(): void {
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    const vUp = this.ship.velocity.dot(pb.up);
    this.hud.update({
      phase: this.phase,
      altitude: pb.altitude,
      speed: this.ship.velocity.length(),
      verticalSpeed: vUp,
      fuelFraction: this.ship.fuelMass / this.initialFuel,
      throttle: this.ship.throttle,
      warning: vUp < -5 && pb.altitude < 5000 ? "HIGH DESCENT RATE" : null,
    });
  }

  private updateMarker(): void {
    const targetName = this.navmap.targetName;
    if (targetName) {
      const target = this.bodies.find((b) => b.name === targetName)!;
      const r = toRender(this.fo, target.position);
      const m = projectMarker(new THREE.Vector3(r.x, r.y, r.z), this.renderer.camera);
      const dist = target.position.sub(this.ship.position).length();
      this.hud.setMarker(`${targetName} ${(dist / 1000).toFixed(0)} km`, m.x, m.y, m.onScreen);
    } else {
      this.hud.hideMarker();
    }
  }

  private snapToSurface(body: Body, up: Vec3, contact: number): void {
    this.ship.position = body.position.add(up.scale(body.radius + contact));
    this.ship.velocity = Vec3.zero();
  }

  private resetToPad(): void {
    const earth = this.bodies[0];
    this.ship = createSpacecraft(new Vec3(0, earth.radius + this.padHeight, 0));
    this.ship.orientation = new Vec3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.phase = initialPhase();
  }

  private doWarp(): void {
    const name = this.navmap.targetName;
    if (!name) return;
    if (this.phase === "OnFoot") return;
    const target = this.bodies.find((b) => b.name === name);
    if (!target) return;
    this.ship = warpTo(this.ship, target);
    // align orientation quaternion with the new orientation (point at target)
    const o = this.ship.orientation;
    this.quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(o.x, o.y, o.z).normalize(),
    );
    this.warpFx.play();
    this.phase = "InSpace";
  }

  private toggleExit(): void {
    if (this.phase === "LandedMoon" && !this.astronaut) {
      const pb = selectPrimaryBody(this.ship.position, this.bodies);
      // spawn just beside the lander on the surface
      const start = pb.body.position.add(pb.up.scale(pb.body.radius + 1.2));
      this.astronaut = createAstronaut(start);
      this.astronaut.onGround = true;
      this.astronautGroup.visible = true;
      this.phase = transition("LandedMoon", "OnFoot");
    } else if (this.phase === "OnFoot" && this.astronaut) {
      this.astronaut = null;
      this.astronautGroup.visible = false;
      this.phase = transition("OnFoot", "LandedMoon");
    }
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }
}
