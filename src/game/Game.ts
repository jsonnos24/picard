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
  totalMass,
} from "../sim/Spacecraft";
import { shipAccelFn } from "../sim/forces";
import { gravityAccel } from "../sim/gravity";
import { verletStep } from "../sim/integrator";
import { createTimeControl, advance, TimeControl } from "../sim/TimeControl";
import { FloatingOrigin, createFloatingOrigin, rebase, toRender } from "../sim/FloatingOrigin";
import { Vec3 } from "../sim/Vec3";
import { FIXED_DT } from "../sim/constants";
import { Phase, initialPhase, transition } from "../sim/GameState";
import { createInputManager, InputManager } from "../sim/input/InputManager";
import { selectPrimaryBody } from "./primaryBody";
import { thrustDirection } from "./attitude";
import { AngularState, zeroAngular, stepTurning } from "./feel/turning";
import { nextThrottle, shouldHoldOnSurface } from "./shipControl";
import { nextPhase, LAUNCH_CLEAR } from "./phases";
import { evaluateTouchdown } from "./landing";
import { HUD } from "../ui/HUD";
import { Controls } from "../ui/Controls";
import { NavMap } from "../ui/NavMap";
import { warpTo } from "../sim/WarpDrive";
import { createWarpEffect } from "../render/scene/warpEffect";
import { WarpSeq, idleWarp, startWarp, stepWarp } from "./feel/warpSequence";
import { createDust } from "../render/scene/dust";
import { createSpeedDust } from "../render/scene/speedDust";
import { skimIntensity } from "./feel/skim";
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
  private angular: AngularState = zeroAngular();
  private lastAccelMag = 0;
  private fo: FloatingOrigin;
  private tc: TimeControl;
  private input!: InputManager;
  private lastTime = 0;
  private readonly padHeight = 7; // half ship height so legs touch
  private phase: Phase = initialPhase();
  private missionElapsed = 0; // simulated seconds since leaving the Earth pad
  private assistOn = false; // landing assist: auto-orient upright + descent-rate limiter
  private static readonly WARP_LEVELS = [1, 4, 10, 25, 100];
  private hud!: HUD;
  private navmap!: NavMap;
  private warpFx!: { update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void };
  private warpSeq: WarpSeq = idleWarp();
  private pendingWarpTarget: Body | null = null;
  private warpFovScale = 1;
  private astronaut: Astronaut | null = null;
  private astronautGroup!: THREE.Group;
  private dust!: { puff(at: THREE.Vector3): void; update(dt: number): void };
  private speedDust!: { update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3, boost?: number): void };

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
    this.initialFuel = this.ship.fuelMass;

    window.addEventListener("resize", () => this.renderer.resize());
    this.hud = new HUD(document.getElementById("ui")!);
    new Controls(document.getElementById("ui")!);
    this.navmap = new NavMap(document.getElementById("ui")!, this.bodies);
    this.warpFx = createWarpEffect(this.renderer.scene);
    this.astronautGroup = createAstronaut3D(this.renderer.scene).group;

    this.dust = createDust(this.renderer.scene);
    this.speedDust = createSpeedDust(this.renderer.scene);
    const canvasEl = this.renderer.camera ? document.getElementById("view")! : document.body;
    canvasEl.addEventListener("click", () => canvasEl.requestPointerLock());
    window.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement) this.rig.addLook(e.movementX, e.movementY);
    });
  }

  private stepSim(): void {
    // Mission clock runs once we've left the Earth pad.
    if (this.phase !== "LandedEarth") this.missionElapsed += FIXED_DT;
    if (this.phase === "OnFoot" && this.astronaut) {
      const pb = selectPrimaryBody(this.astronaut.position, this.bodies);
      const dt = FIXED_DT;
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
    if (this.assistOn && (this.phase === "InSpace" || this.phase === "Descending")) {
      // Landing assist drives orientation + throttle this step.
      this.applyLandingAssist();
      // Player isn't manually turning during assist; zero the rate so g-lean decays to zero.
      this.angular = zeroAngular();
    } else {
      // Momentum turning: rates ramp up and ease out for a swoopy, alive feel.
      const turn = stepTurning(this.quat, this.angular, this.input, dt);
      this.quat = turn.quat;
      this.angular = turn.state;
      this.ship.throttle = nextThrottle(this.ship.throttle, this.input, dt);
      this.ship.orientation = thrustDirection(this.quat);
    }

    const accel = shipAccelFn(this.ship, this.bodies);
    this.lastAccelMag = shipThrustAccel(this.ship).length();
    const next = verletStep(toMotionState(this.ship), dt, accel);
    this.ship = applyMotionState(this.ship, next);
    this.ship = burnFuel(this.ship, dt);

    // Landed hold: pin to the surface until thrust can beat gravity.
    // Must NOT run during Descending so Moon crash detection reads real velocity.
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    const thrustMag = shipThrustAccel(this.ship).length();
    if (this.phase !== "Descending") {
      if (pb.altitude < this.padHeight && shouldHoldOnSurface(thrustMag, surfaceGravity(pb.body))) {
        this.ship.position = pb.body.position.add(pb.up.scale(pb.body.radius + this.padHeight));
        this.ship.velocity = Vec3.zero();
      }
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
        this.assistOn = false;
        this.ship.throttle = 0;
        const r = toRender(this.fo, this.ship.position);
        this.dust.puff(new THREE.Vector3(r.x, r.y, r.z));
      } else if (result === "crash") {
        this.resetToPad();
      }
    }
  }

  private setOrient(dir: Vec3): void {
    this.ship.orientation = dir;
    this.quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
    );
  }

  // Landing assist (auto-descent + soft touchdown). Two phases driven by a
  // "safe speed" = the fastest descent we can still arrest before the surface:
  //   safeSpeed = sqrt(2 * aDec * distanceToSurface).
  // If we're slower than that, thrust toward the planet to descend faster;
  // otherwise thrust away to brake — which naturally eases to a gentle, upright
  // (tilt 0) touchdown.
  private applyLandingAssist(): void {
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    const vUp = this.ship.velocity.dot(pb.up);
    const speed = Math.max(0, -vUp); // descent speed (m/s)
    const gLocal = gravityAccel(this.ship.position, this.bodies).length();
    const aMax = this.ship.maxThrust / totalMass(this.ship);
    const aDec = Math.max(0.5, aMax - gLocal); // net deceleration available, engine up
    const distToGo = Math.max(0, pb.altitude - this.padHeight);
    // Altitude-aware target: half the arrestable speed (always leaves margin to stop
    // before the surface), plus a modest cap so we don't spend delta-v overspeeding.
    let targetSpeed = Math.min(Math.sqrt(2 * aDec * distToGo) * 0.5, 1500);
    // Force a slow, gentle final approach so touchdown is well under the safe limit.
    if (pb.altitude < 400) targetSpeed = Math.min(targetSpeed, 15);
    if (pb.altitude < 80) targetSpeed = Math.min(targetSpeed, 3);

    if (speed < targetSpeed - 8 && pb.altitude > this.padHeight + 50) {
      // Build descent speed toward the target: engine toward planet (coast near target).
      this.setOrient(pb.up.scale(-1));
      this.ship.throttle = Math.max(0, Math.min(0.5, (targetSpeed - speed) * 0.02));
    } else {
      // Brake / hold: engine away from the planet, track the shrinking safe speed
      // down to a gentle, upright touchdown.
      this.setOrient(pb.up);
      const targetVS = -Math.max(2, targetSpeed);
      const desiredAccel = (targetVS - vUp) * 2.0;
      this.ship.throttle = Math.max(0, Math.min(1, (desiredAccel + gLocal) / aMax));
    }
  }

  private frame = (t: number): void => {
    const dt = this.lastTime === 0 ? 0 : (t - this.lastTime) / 1000;
    this.lastTime = t;
    if (this.input.consumePressed("openMap")) this.navmap.toggle();
    if (this.input.consumePressed("warp")) this.doWarp();
    if (this.input.consumePressed("toggleExit")) this.toggleExit();
    if (this.input.consumePressed("toggleCamera")) this.rig.toggleDownView();
    if (this.input.consumePressed("warpFaster")) this.stepTimeWarp(1);
    if (this.input.consumePressed("warpSlower")) this.stepTimeWarp(-1);
    if (this.input.consumePressed("landingAssist")) this.assistOn = !this.assistOn;

    // Drive the warp leap sequence (charge → release → settle).
    const w = stepWarp(this.warpSeq, dt);
    this.warpSeq = w.seq;
    this.warpFovScale = w.fovScale;
    if (w.teleport && this.pendingWarpTarget) {
      this.executeWarp(this.pendingWarpTarget);
      this.pendingWarpTarget = null;
    }

    if (this.assistOn && (this.phase === "InSpace" || this.phase === "Descending")) {
      // The assist flies the descent — auto-time-warp through the boring part and
      // ease back near the surface so the touchdown is at a watchable speed.
      // (Physics is per fixed-step, so warping stays accurate.)
      const alt = selectPrimaryBody(this.ship.position, this.bodies).altitude;
      const ts = alt > 8000 ? 40 : alt > 2000 ? 12 : alt > 400 ? 4 : alt > 120 ? 2 : 1;
      this.tc = { ...this.tc, timeScale: ts };
    } else if (this.phase !== "InSpace" && this.tc.timeScale !== 1) {
      // Manual time-warp only while cruising in space; force x1 otherwise so you
      // can't fast-forward into a launch/descent/landing.
      this.tc = { ...this.tc, timeScale: 1 };
    }
    this.dust.update(dt);
    if (this.navmap.isOpen) {
      // Drain the accumulator without stepping — map open pauses the sim.
      this.tc = advance(this.tc, Math.min(dt, 0.1)).next;
    } else {
      const { steps, next } = advance(this.tc, Math.min(dt, 0.1));
      this.tc = next;
      for (let i = 0; i < steps; i++) this.stepSim();
    }

    const focusPos = this.phase === "OnFoot" && this.astronaut ? this.astronaut.position : this.ship.position;
    this.fo = rebase(this.fo, focusPos);
    updateBodies(this.views, this.fo);

    const shipRender = toRender(this.fo, this.ship.position);
    const shipVec = new THREE.Vector3(shipRender.x, shipRender.y, shipRender.z);
    this.shipGroup.position.copy(shipVec);
    this.shipGroup.quaternion.copy(this.quat);
    // First-person cockpit: hide our own exterior so it doesn't fill the view.
    // Show the lander only when we've stepped out (to look back at it).
    this.shipGroup.visible = this.phase === "OnFoot";

    if (this.phase === "OnFoot" && this.astronaut) {
      const r = toRender(this.fo, this.astronaut.position);
      const pb = selectPrimaryBody(this.astronaut.position, this.bodies);
      const up = new THREE.Vector3(pb.up.x, pb.up.y, pb.up.z);
      const eye = new THREE.Vector3(r.x, r.y, r.z).add(up.clone().multiplyScalar(1.6));
      this.renderer.camera.position.copy(eye);
      this.renderer.camera.up.copy(up);
      // Base orientation: look along a surface-tangent direction.
      // Guard against degenerate case where up is (anti)parallel to world +X by choosing a fallback axis.
      const refAxis = Math.abs(up.x) > 0.9
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);
      const baseFwd = refAxis.clone().sub(up.clone().multiplyScalar(up.dot(refAxis))).normalize();
      this.renderer.camera.lookAt(eye.clone().add(baseFwd));
      this.rig.applyLook(this.renderer.camera);
      this.astronautGroup.position.set(r.x, r.y, r.z);
      this.astronautGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    } else {
      this.rig.setCockpit(
        shipVec,
        this.quat,
        this.ship.velocity.length(),
        this.lastAccelMag,
        this.angular,
        t / 1000,
        this.warpFovScale,
      );
    }

    this.navmap.update(this.ship.position);
    this.warpFx.update(this.renderer.camera.position, w.tunnel, w.flash);
    const focusVel = this.phase === "OnFoot" && this.astronaut ? this.astronaut.velocity : this.ship.velocity;
    const focusPb = selectPrimaryBody(focusPos, this.bodies);
    const skim = skimIntensity(focusPb.altitude, focusVel.length());
    this.speedDust.update(focusVel, dt, this.renderer.camera.position, skim);
    this.updateHud();
    this.updateMarker();
    this.renderer.render();
    requestAnimationFrame(this.frame);
  };

  private initialFuel = 0;

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
      timeScale: this.tc.timeScale,
      missionSeconds: this.missionElapsed,
      assistOn: this.assistOn,
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
    this.angular = zeroAngular();
    this.phase = initialPhase();
    this.missionElapsed = 0;
    this.tc = { ...this.tc, timeScale: 1 };
    this.assistOn = false;
  }

  // Cycle the time-warp multiplier through WARP_LEVELS (only meaningful in space;
  // the frame loop forces x1 outside InSpace).
  private stepTimeWarp(dir: number): void {
    if (this.phase !== "InSpace") return;
    const levels = Game.WARP_LEVELS;
    const i = levels.indexOf(this.tc.timeScale);
    const next = levels[Math.max(0, Math.min(levels.length - 1, (i < 0 ? 0 : i) + dir))];
    this.tc = { ...this.tc, timeScale: next };
  }

  private doWarp(): void {
    if (this.warpSeq.phase !== "idle") return; // already warping
    const name = this.navmap.targetName;
    if (!name) return;
    if (this.phase !== "InSpace" && this.phase !== "Launching" && this.phase !== "Descending") return;
    const target = this.bodies.find((b) => b.name === name);
    if (!target) return;
    this.pendingWarpTarget = target;
    this.warpSeq = startWarp();
  }

  private executeWarp(target: Body): void {
    this.ship = warpTo(this.ship, target);
    const o = this.ship.orientation;
    this.quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(o.x, o.y, o.z).normalize(),
    );
    this.angular = zeroAngular();
    this.rig.resetLook();
    this.phase = "InSpace";
  }

  private toggleExit(): void {
    if (this.phase === "LandedMoon" && !this.astronaut) {
      const pb = selectPrimaryBody(this.ship.position, this.bodies);
      // Spawn a few metres to the side of the lander (offset along a surface tangent)
      // so the astronaut can turn and see the lander rather than spawning inside it.
      const ref = Math.abs(pb.up.x) > 0.9 ? new Vec3(0, 0, 1) : new Vec3(1, 0, 0);
      const tangent = ref.sub(pb.up.scale(ref.dot(pb.up))).normalize();
      const start = pb.body.position
        .add(pb.up.scale(pb.body.radius + 1.2))
        .add(tangent.scale(10));
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
