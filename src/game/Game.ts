import * as THREE from "three";
import { Renderer } from "../render/Renderer";
import { createBodies, updateBodies, BodyView } from "../render/scene/bodies";
import { createShip } from "../render/scene/ship";
import { CameraRig } from "../render/CameraRig";
import { createSolarSystem, findBody, Body, surfaceGravity } from "../sim/Body";
import {
  Spacecraft,
  createSpacecraft,
  toMotionState,
  applyMotionState,
  thrustAccel as shipThrustAccel,
} from "../sim/Spacecraft";
import { shipAccelFn } from "../sim/forces";
import {
  SlingState,
  DEFAULT_SLING_PARAMS,
  idleSling,
  tryCapture,
  stepSwing,
  releaseFling,
  tickSling,
  sunRepel,
  alignSwingPlane,
} from "../sim/slingshot";
import { createGravityRings } from "../render/scene/gravityRings";
import { gravityAccel } from "../sim/gravity";
import { verletStep } from "../sim/integrator";
import { createTimeControl, advance, TimeControl } from "../sim/TimeControl";
import { FloatingOrigin, createFloatingOrigin, rebase, toRender } from "../sim/FloatingOrigin";
import { Vec3 } from "../sim/Vec3";
import { FIXED_DT } from "../sim/constants";
import { Phase, initialPhase, transition, phaseLabel } from "../sim/GameState";
import { createInputManager, InputManager } from "../sim/input/InputManager";
import { selectPrimaryBody } from "./primaryBody";
import { thrustDirection } from "./attitude";
import { AngularState, zeroAngular, stepTurning } from "./feel/turning";
import { nextThrottle, shouldHoldOnSurface } from "./shipControl";
import { BrakeState, idleBrake, stepBrake } from "./retroBrake";
import { stepBreakaway } from "./breakaway";
import { nextPhase, LAUNCH_CLEAR } from "./phases";
import { jumpDecision, lightspeedTap } from "./jump";
import { evaluateTouchdown } from "./landing";
import { padReset } from "./padReset";
import { HUD } from "../ui/HUD";
import { Controls } from "../ui/Controls";
import { NavMap } from "../ui/NavMap";
import { TouchControls } from "../ui/TouchControls";
import { contextAction } from "./contextAction";
import {
  DEFAULT_LS_PARAMS,
  lightspeedStep,
  freeCruiseStep,
  brakeStep,
  etaSeconds,
} from "../sim/lightspeed";
import { createWarpEffect } from "../render/scene/warpEffect";
import {
  LsSeq,
  idleSeq,
  startCharge,
  startBurst,
  endCruise,
  stepLsSeq,
} from "./feel/lightspeedSequence";
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
  private hud!: HUD;
  private navmap!: NavMap;
  private warpFx!: { update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void };
  private lsSeq: LsSeq = idleSeq();
  private lsTargetName: string | null = null; // pending (charging) or active cruise target
  private lsFree = false; // pending or active point-and-fly jump (no target)
  private lsFreeDir: Vec3 | null = null; // persistent nose direction of a free cruise
  private cruising = false;
  private lsBraking = false; // cancelled mid-cruise: bleeding speed back down
  private lsFovScale = 1;
  private sling: SlingState = idleSling();
  private slingHeldPrev = false;
  private notice: string | null = null;
  private noticeUntil = 0; // missionElapsed deadline for the transient notice
  private brake: BrakeState = idleBrake();
  private breakHold = 0; // seconds W has been held while captured (rail breakaway)
  private preBrakeOrient: Vec3 | null = null; // orientation to restore if the brake is released early
  private lsGraceUntil = -1; // perfect release: lightspeed skips the charge until this time
  private gravityRings!: { update(fo: FloatingOrigin, capturedName: string | null, t: number): void };
  private readonly sun: Body;
  private touch!: TouchControls;
  private astronaut: Astronaut | null = null;
  private astronautGroup!: THREE.Group;
  private dust!: { puff(at: THREE.Vector3): void; update(dt: number): void };
  private speedDust!: { update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3, boost?: number): void };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(this.renderer.camera);
    this.bodies = createSolarSystem();
    this.sun = findBody(this.bodies, "Sun");
    this.views = createBodies(this.renderer.scene, this.bodies);
    this.gravityRings = createGravityRings(this.renderer.scene, this.bodies);
    this.shipGroup = createShip(this.renderer.scene).group;
    this.fo = createFloatingOrigin();
    this.tc = createTimeControl();
    this.input = createInputManager();
    window.addEventListener("keydown", (e) => this.input.handleKey(e.code, true));
    window.addEventListener("keyup", (e) => this.input.handleKey(e.code, false));

    // Spawn on Earth's "north pole" pad (+Y), resting on the surface.
    const earth = findBody(this.bodies, "Earth");
    this.ship = createSpacecraft(
      earth.position.add(new Vec3(0, earth.radius + this.padHeight, 0)),
    );
    this.ship.orientation = new Vec3(0, 1, 0);

    window.addEventListener("resize", () => this.renderer.resize());
    this.hud = new HUD(document.getElementById("ui")!);
    new Controls(document.getElementById("ui")!);
    this.navmap = new NavMap(document.getElementById("ui")!, this.bodies);
    this.touch = new TouchControls(document.getElementById("ui")!, this.input);
    this.warpFx = createWarpEffect(this.renderer.scene);
    this.astronautGroup = createAstronaut3D(this.renderer.scene).group;

    this.dust = createDust(this.renderer.scene);
    this.speedDust = createSpeedDust(this.renderer.scene);
    // Pointer Lock free-look is a mouse-only affordance; touch steers by drag.
    if (window.matchMedia("(pointer: fine)").matches) {
      const canvasEl = this.renderer.camera ? document.getElementById("view")! : document.body;
      canvasEl.addEventListener("click", () => canvasEl.requestPointerLock());
      window.addEventListener("mousemove", (e) => {
        if (document.pointerLockElement) this.rig.addLook(e.movementX, e.movementY);
      });
    }
  }

  private stepSim(): void {
    // Mission clock starts on first launch and never stops.
    if (this.phase.kind !== "landed" || this.missionElapsed > 0) this.missionElapsed += FIXED_DT;
    if (this.phase.kind === "onFoot" && this.astronaut) {
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
      // Touch drag walks too (override only — keyboard is covered above).
      const ox = this.input.getAxisOverride("steerX");
      const oy = this.input.getAxisOverride("steerY");
      if (ox) move.add(right.clone().multiplyScalar(ox));
      if (oy) move.add(fwd.clone().multiplyScalar(oy));
      const walkDir = new Vec3(move.x, move.y, move.z);
      const jump = this.input.isActive("jump");
      this.astronaut = stepAstronaut(this.astronaut, pb.body, walkDir, jump, dt);
      return; // skip ship integration this step
    }

    const dt = FIXED_DT;

    // Lightspeed cruise: the profile drives the ship directly (gravity is
    // negligible at these speeds); hands off at the target's capture ring.
    if (this.cruising && this.lsTargetName) {
      const target = findBody(this.bodies, this.lsTargetName);
      const steer = { x: this.input.getAxis("steerX"), y: this.input.getAxis("steerY") };
      const r = lightspeedStep(this.ship.position, this.ship.velocity, target, steer, dt);
      this.ship.position = r.pos;
      this.ship.velocity = r.vel;
      this.ship.throttle = 0;
      this.setOrient(r.vel.normalize());
      this.angular = zeroAngular();
      if (r.done) {
        this.cruising = false;
        this.lsTargetName = null;
        this.lsSeq = endCruise(this.lsSeq);
      }
      this.updatePhaseFromAltitude();
      return;
    }

    // Point-and-fly cruise: no target — fly the nose until a gravity bubble
    // on the ray ends the trip (handed off exactly like a guided arrival).
    if (this.cruising) {
      const steer = { x: this.input.getAxis("steerX"), y: this.input.getAxis("steerY") };
      const dir = this.lsFreeDir ?? this.ship.orientation.normalize();
      const r = freeCruiseStep(this.ship.position, this.ship.velocity, dir, steer, dt, this.bodies);
      this.ship.position = r.pos;
      this.ship.velocity = r.vel;
      this.lsFreeDir = r.dir;
      this.ship.throttle = 0;
      this.setOrient(r.vel.normalize());
      this.angular = zeroAngular();
      if (r.done) {
        this.cruising = false;
        this.lsFree = false;
        this.lsFreeDir = null;
        this.lsSeq = endCruise(this.lsSeq);
        if (r.bodyName) this.showNotice(`ENTERING ${r.bodyName.toUpperCase()}'S GRAVITY RING`);
      }
      this.updatePhaseFromAltitude();
      return;
    }

    // Cancelled cruise: coast while braking down to a sane drift speed.
    if (this.lsBraking) {
      const b = brakeStep(this.ship.velocity, dt);
      this.ship.velocity = b.vel;
      this.ship.position = this.ship.position.add(b.vel.scale(dt));
      if (b.done) this.lsBraking = false;
      this.updatePhaseFromAltitude();
      return;
    }

    this.sling = tickSling(this.sling, dt, this.ship.position, this.bodies);

    // Captured in a gravity ring: the swing rail drives the ship.
    if (this.sling.kind === "captured") {
      const body = findBody(this.bodies, this.sling.bodyName);
      const held = this.input.isActive("slingHold");

      // The engine always wins: sustained W powers the ship off the rail,
      // nose out, so "hold W" is never a dead input while tethered.
      const bk = stepBreakaway(this.breakHold, this.input.isActive("throttleUp"), dt);
      this.breakHold = bk.hold;
      if (bk.free) {
        this.sling = {
          kind: "released",
          bodyName: this.sling.bodyName,
          cooldown: DEFAULT_SLING_PARAMS.cooldown,
        };
        this.setOrient(this.ship.position.sub(body.position).normalize());
        this.ship.throttle = 1; // W is already held — respond instantly
        this.angular = zeroAngular();
        this.breakHold = 0;
        this.slingHeldPrev = false;
        return;
      }

      if (this.assistOn) {
        // Tap-to-land while captured: the ring "absorbs" the swing momentum and
        // drops the ship gently — capped so the assist can always arrest it.
        this.sling = {
          kind: "released",
          bodyName: this.sling.bodyName,
          cooldown: DEFAULT_SLING_PARAMS.cooldown,
        };
        const drop = Math.min(this.ship.velocity.length() * 0.3, 250);
        this.ship.velocity = this.ship.velocity.normalize().scale(drop);
        this.slingHeldPrev = false;
        return;
      }

      if (this.slingHeldPrev && !held) {
        // The hammer throw: fling along the tangent, snapping to the nav target.
        const fling = releaseFling(this.sling, body, this.navTargetDirection());
        this.sling = fling.state;
        this.ship.velocity = fling.velocity;
        this.setOrient(fling.velocity.normalize());
        if (fling.snapped) this.lsGraceUntil = this.missionElapsed + 2; // chain reward
        this.slingHeldPrev = false;
        return;
      }

      const steer = this.input.getAxis("steerY");
      // Tip the swing plane to contain the nav target so an aligned release
      // always exists — any entry can otherwise leave the target unreachable
      // and the player circling forever. Manual steer overrides.
      const navDir = this.navTargetDirection();
      if (steer === 0 && navDir) {
        this.sling = alignSwingPlane(this.sling, navDir, dt);
      }
      const r = stepSwing(this.sling, body, held, steer, dt);
      this.sling = r.state;
      this.ship.position = r.pos;
      this.ship.velocity = r.vel;
      this.ship.throttle = 0;
      this.setOrient(r.vel.normalize());
      this.angular = zeroAngular();
      this.slingHeldPrev = held;
      this.phase = { kind: "space" }; // a swing is a space activity, however low it dips
      return;
    }

    if (this.assistOn && (this.phase.kind === "space" || this.phase.kind === "descending")) {
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

      // Retro-brake: keeping S (or BRAKE) held past the grace period after the
      // throttle hits zero flips the rocket retrograde and burns to a stop.
      // The state machine is forgiving: easing the throttle down never flips,
      // and letting go restores where you were pointing with the engine off.
      const speed = this.ship.velocity.length();
      const r = stepBrake(this.brake, {
        braking: this.input.isActive("throttleDown"),
        throttle: this.ship.throttle,
        speed,
        inFlight: this.phase.kind !== "landed",
        aMax: this.ship.maxThrust / this.ship.mass,
        dt,
      });
      this.brake = r.state;
      if (r.command === "burn") {
        if (!this.preBrakeOrient) this.preBrakeOrient = this.ship.orientation;
        this.setOrient(this.ship.velocity.scale(-1 / speed));
        this.ship.throttle = 1;
        this.angular = zeroAngular();
      } else if (r.command === "stop") {
        // Arrested: engine off, nose back to local up so W means "away from
        // the planet", never "into it".
        this.ship.velocity = Vec3.zero();
        this.ship.throttle = 0;
        const pb = selectPrimaryBody(this.ship.position, this.bodies);
        this.setOrient(pb.up);
        this.preBrakeOrient = null;
      } else if (r.command === "release") {
        // Let go mid-burn: engine off, restore the pre-brake heading.
        this.ship.throttle = 0;
        if (this.preBrakeOrient) this.setOrient(this.preBrakeOrient);
        this.preBrakeOrient = null;
        this.angular = zeroAngular();
      }
    }

    // The Sun never captures — it shoves (plus heat warnings on the HUD).
    const base = shipAccelFn(this.ship, this.bodies);
    const accel = (p: Vec3, v: Vec3): Vec3 => base(p, v).add(sunRepel(p, this.sun));
    this.lastAccelMag = shipThrustAccel(this.ship).length();
    const next = verletStep(toMotionState(this.ship), dt, accel);
    this.ship = applyMotionState(this.ship, next);

    // Fast flight into a gravity ring hooks the ship onto the swing rail —
    // but never mid-lightspeed (the drop profile owns arrivals).
    const lsBusy =
      this.cruising || this.lsBraking || this.lsSeq.phase === "charge" || this.lsSeq.phase === "burst";
    if (this.phase.kind === "space" && this.sling.kind === "none" && !this.assistOn && !lsBusy) {
      const right3 = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
      const camRight = new Vec3(right3.x, right3.y, right3.z);
      const navDir = this.navTargetDirection();
      for (const body of this.bodies) {
        // Dead-radial entries (falling straight at the body) need a fallback
        // swing plane: build it to CONTAIN the nav target, so a release can
        // always line up with where the player wants to go.
        let fallback = camRight;
        if (navDir) {
          const rHat = this.ship.position.sub(body.position).normalize();
          const perp = navDir.sub(rHat.scale(navDir.dot(rHat)));
          if (perp.length() > 0.05) fallback = perp.normalize();
        }
        const s = tryCapture(this.sling, this.ship.position, this.ship.velocity, body, fallback, dt);
        if (s.kind === "captured") {
          this.sling = s;
          this.slingHeldPrev = false;
          this.rig.resetLook();
          break;
        }
      }
    }

    // Landed hold: pin to the surface until thrust can beat gravity.
    // Must NOT run during Descending so Moon crash detection reads real velocity.
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    const thrustMag = shipThrustAccel(this.ship).length();
    if (this.phase.kind !== "descending") {
      if (pb.altitude < this.padHeight && shouldHoldOnSurface(thrustMag, surfaceGravity(pb.body))) {
        this.ship.position = pb.body.position.add(pb.up.scale(pb.body.radius + this.padHeight));
        this.ship.velocity = Vec3.zero();
      }
    }

    this.phase = nextPhase({
      phase: this.phase,
      altitude: pb.altitude,
      primary: { name: pb.body.name, radius: pb.body.radius, landable: pb.body.landable },
      launched: pb.altitude > LAUNCH_CLEAR,
    });

    // Touchdown / crash detection while descending onto any body.
    if (this.phase.kind === "descending") {
      const vUp = this.ship.velocity.dot(pb.up);
      const tilt = Math.acos(Math.max(-1, Math.min(1, this.ship.orientation.normalize().dot(pb.up))));
      const result = evaluateTouchdown(pb.altitude, vUp, tilt, this.padHeight);
      if (result === "landed") {
        this.snapToSurface(pb.body, pb.up, this.padHeight);
        this.phase = transition(this.phase, { kind: "landed", body: pb.body.name });
        this.assistOn = false;
        this.ship.throttle = 0;
        const r = toRender(this.fo, this.ship.position);
        this.dust.puff(new THREE.Vector3(r.x, r.y, r.z));
      } else if (result === "crash") {
        this.resetToPad();
      }
    }
  }

  private updatePhaseFromAltitude(): void {
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    this.phase = nextPhase({
      phase: this.phase,
      altitude: pb.altitude,
      primary: { name: pb.body.name, radius: pb.body.radius, landable: pb.body.landable },
      launched: pb.altitude > LAUNCH_CLEAR,
    });
  }

  private setOrient(dir: Vec3): void {
    this.ship.orientation = dir;
    this.quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
    );
  }

  // Landing assist (auto-descent + soft touchdown): a velocity-vector autopilot.
  // Tracks an altitude-aware descent-rate target (a fraction of the arrestable
  // speed, sqrt(2·aDec·dist), so we can always stop before the surface) while
  // cancelling sideways drift — one thrust command handles a vertical drop and
  // a fast flyby arrival alike, easing to a gentle, upright touchdown.
  private applyLandingAssist(): void {
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    const vUp = this.ship.velocity.dot(pb.up);
    const vHoriz = this.ship.velocity.sub(pb.up.scale(vUp));
    const gLocal = gravityAccel(this.ship.position, this.bodies).length();
    const aMax = this.ship.maxThrust / this.ship.mass;
    const aDec = Math.max(0.5, aMax - gLocal); // net deceleration available, engine up
    const distToGo = Math.max(0, pb.altitude - this.padHeight);
    let targetSpeed = Math.min(Math.sqrt(2 * aDec * distToGo) * 0.6, 400);
    // Force a slow, gentle final approach so touchdown is well under the safe limit.
    if (pb.altitude < 250) targetSpeed = Math.min(targetSpeed, 18);
    if (pb.altitude < 60) targetSpeed = Math.min(targetSpeed, 4);
    const targetVS = -Math.max(2, targetSpeed);

    // Desired acceleration: track the descent rate, null the drift, fight gravity.
    const cmd = pb.up.scale((targetVS - vUp) * 2.0 + gLocal).sub(vHoriz.scale(1.5));
    const mag = cmd.length();
    if (mag < 0.3) {
      this.ship.throttle = 0;
      return;
    }
    this.setOrient(cmd.scale(1 / mag));
    this.ship.throttle = Math.max(0, Math.min(1, mag / aMax));
  }

  private frame = (t: number): void => {
    const dt = this.lastTime === 0 ? 0 : (t - this.lastTime) / 1000;
    this.lastTime = t;
    if (this.input.consumePressed("openMap")) this.navmap.toggle();
    if (this.input.consumePressed("lightspeed")) this.toggleLightspeed();
    if (this.input.consumePressed("toggleExit")) this.toggleExit();
    if (this.input.consumePressed("toggleCamera")) this.rig.toggleMode();
    if (this.input.consumePressed("landingAssist")) this.assistOn = !this.assistOn;

    // Drive the lightspeed cinematics (charge → burst → cruise → settle).
    const cruiseIntensity = this.cruising
      ? this.ship.velocity.length() / DEFAULT_LS_PARAMS.vMax
      : 0;
    const w = stepLsSeq(this.lsSeq, dt, cruiseIntensity);
    this.lsSeq = w.seq;
    this.lsFovScale = w.fovScale;
    if (w.engage && (this.lsTargetName || this.lsFree)) {
      this.cruising = true;
      this.lsBraking = false;
      if (this.lsFree) this.lsFreeDir = this.ship.orientation.normalize();
      this.rig.resetLook();
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

    const focusPos = this.phase.kind === "onFoot" && this.astronaut ? this.astronaut.position : this.ship.position;
    this.fo = rebase(this.fo, focusPos);
    updateBodies(this.views, this.fo, this.renderer.camera.position);
    this.gravityRings.update(
      this.fo,
      this.sling.kind === "captured" ? this.sling.bodyName : null,
      t / 1000,
    );

    const shipRender = toRender(this.fo, this.ship.position);
    const shipVec = new THREE.Vector3(shipRender.x, shipRender.y, shipRender.z);
    this.shipGroup.position.copy(shipVec);
    this.shipGroup.quaternion.copy(this.quat);
    // Chase cam shows the toon ship; cockpit hides our own exterior. On foot the
    // lander stays visible so you can look back at it.
    this.shipGroup.visible = this.rig.mode === "chase" || this.phase.kind === "onFoot";

    if (this.phase.kind === "onFoot" && this.astronaut) {
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
    } else if (this.rig.mode === "chase") {
      let slingView = null;
      if (this.sling.kind === "captured") {
        const body = findBody(this.bodies, this.sling.bodyName);
        const c = toRender(this.fo, body.position);
        slingView = {
          center: new Vec3(c.x, c.y, c.z),
          normal: this.sling.e1.cross(this.sling.e2).normalize(),
          bodyRadius: body.radius,
        };
      }
      const pb = selectPrimaryBody(this.ship.position, this.bodies);
      const gc = toRender(this.fo, pb.body.position);
      const ground = {
        center: new Vec3(gc.x, gc.y, gc.z),
        radius: pb.body.radius,
        up: pb.up,
        altitude: pb.altitude,
      };
      this.rig.setChase(
        shipVec,
        this.quat,
        this.ship.velocity.length(),
        dt,
        slingView,
        ground,
        this.lsFovScale,
      );
    } else {
      this.rig.setCockpit(
        shipVec,
        this.quat,
        this.ship.velocity.length(),
        this.lastAccelMag,
        this.angular,
        t / 1000,
        this.lsFovScale,
      );
    }

    this.navmap.update(this.ship.position);
    this.touch.update(
      contextAction({
        phaseKind: this.phase.kind,
        slingCaptured: this.sling.kind === "captured",
        capturedAtTarget: this.capturedAtTarget(),
        cruising: this.cruising,
        charging: this.lsSeq.phase === "charge" || this.lsSeq.phase === "burst",
        hasTarget: this.navmap.targetName !== null,
        assistOn: this.assistOn,
      }),
      this.phase.kind === "onFoot",
      this.phase.kind === "landed",
      (this.phase.kind === "space" || this.phase.kind === "descending") &&
        !this.cruising &&
        this.sling.kind !== "captured",
    );
    this.warpFx.update(this.renderer.camera.position, w.tunnel, w.flash);
    const focusVel = this.phase.kind === "onFoot" && this.astronaut ? this.astronaut.velocity : this.ship.velocity;
    const focusPb = selectPrimaryBody(focusPos, this.bodies);
    const skim = skimIntensity(focusPb.altitude, focusVel.length());
    this.speedDust.update(focusVel, dt, this.renderer.camera.position, skim);
    this.updateHud();
    this.updateMarker();
    this.renderer.render();
    requestAnimationFrame(this.frame);
  };

  private updateHud(): void {
    const pb = selectPrimaryBody(this.ship.position, this.bodies);
    const vUp = this.ship.velocity.dot(pb.up);
    let lightspeedEta: number | null = null;
    if (this.cruising && this.lsTargetName) {
      const target = findBody(this.bodies, this.lsTargetName);
      const distToDrop =
        target.position.sub(this.ship.position).length() - target.captureRadius;
      lightspeedEta = etaSeconds(distToDrop, this.ship.velocity.length());
    }
    let sling: {
      winding: boolean;
      speed: number;
      aligned: boolean;
      atTarget: boolean;
    } | null = null;
    if (this.sling.kind === "captured") {
      const navDir = this.navTargetDirection();
      const aligned =
        !!navDir &&
        Math.acos(
          Math.max(-1, Math.min(1, this.ship.velocity.normalize().dot(navDir))),
        ) <= DEFAULT_SLING_PARAMS.snapCone;
      sling = {
        winding: this.input.isActive("slingHold"),
        speed: this.sling.speed,
        aligned,
        atTarget: this.capturedAtTarget(),
      };
    }
    const inSunBubble =
      this.ship.position.sub(this.sun.position).length() < this.sun.captureRadius;
    this.hud.update({
      phase: phaseLabel(this.phase),
      altitude: pb.altitude,
      speed: this.ship.velocity.length(),
      verticalSpeed: vUp,
      throttle: this.ship.throttle,
      warning: inSunBubble
        ? "☀ SOLAR HEAT — PULL AWAY"
        : vUp < -20 && pb.altitude < 500
          ? "HIGH DESCENT RATE"
          : this.missionElapsed < this.noticeUntil
            ? this.notice
            : null,
      lightspeedEta,
      sling,
      missionSeconds: this.missionElapsed,
      assistOn: this.assistOn,
      hint: this.keyboardHint(),
    });
  }

  // The one thing the player most likely wants to do next, in keyboard terms.
  // (Touch players get the same guidance from the context button.)
  private keyboardHint(): string | null {
    if (this.sling.kind === "captured") {
      if (this.capturedAtTarget() && !this.input.isActive("slingHold")) {
        return "you've arrived — L to land · J to jump away · SPACE to swing";
      }
      return this.input.isActive("slingHold")
        ? "release SPACE to fling · or J to jump now"
        : "hold SPACE to swing · hold W to fly free · J lightspeed · L land";
    }
    if (this.cruising) return "J to drop out early";
    if (this.lsSeq.phase === "charge" || this.lsSeq.phase === "burst") return null;
    switch (this.phase.kind) {
      case "landed":
        return this.navmap.targetName
          ? `J — lightspeed to ${this.navmap.targetName} · hold W to launch · F to hop out`
          : "J — lightspeed where you point · hold W to launch · F to hop out";
      case "launching":
      case "space": {
        const brake =
          this.ship.velocity.length() > 50 && this.ship.throttle <= 0 ? " · hold S to brake" : "";
        return this.navmap.targetName
          ? `J — lightspeed to ${this.navmap.targetName}${brake}`
          : `J — lightspeed where you point · M for a guided trip${brake}`;
      }
      case "descending":
        return this.assistOn ? null : "L — auto-land · hold S to brake";
      case "onFoot":
        return "WASD walk · SPACE jump · F board";
    }
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
    const earth = findBody(this.bodies, "Earth");
    this.ship = createSpacecraft(
      earth.position.add(new Vec3(0, earth.radius + this.padHeight, 0)),
    );
    this.ship.orientation = new Vec3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.angular = zeroAngular();
    this.brake = idleBrake();
    this.preBrakeOrient = null;
    this.breakHold = 0;
    this.phase = initialPhase();
    this.missionElapsed = 0;
    this.tc = { ...this.tc, timeScale: 1 };
    this.assistOn = false;
    const r = padReset();
    this.sling = r.sling;
    this.slingHeldPrev = r.slingHeldPrev;
    this.cruising = r.cruising;
    this.lsTargetName = r.lsTargetName;
    this.lsBraking = r.lsBraking;
    this.lsSeq = r.lsSeq;
    this.lsFree = r.lsFree;
    this.lsFreeDir = r.lsFreeDir;
  }

  private showNotice(text: string): void {
    this.notice = text;
    this.noticeUntil = this.missionElapsed + 3.5;
  }

  // Swinging in the ring of the body the player meant to reach — arrival.
  // With a nav target that's the targeted body; with none (point-and-fly)
  // any capture counts: you flew here on purpose, and the aligned-release
  // cue can never fire without a target direction either way. Arrival UI
  // must offer landing, not endless swinging.
  private capturedAtTarget(): boolean {
    if (this.sling.kind !== "captured") return false;
    const target = this.navmap.targetName;
    return target === null || this.sling.bodyName === target;
  }

  // Unit direction from the ship to the nav target, if one is set.
  private navTargetDirection(): Vec3 | null {
    const name = this.navmap.targetName;
    if (!name) return null;
    const target = findBody(this.bodies, name);
    return target.position.sub(this.ship.position).normalize();
  }

  private toggleLightspeed(): void {
    const tap = lightspeedTap(this.cruising, this.lsSeq.phase);
    if (tap === "dropout") {
      // Cancel: wind the cinematics down and bleed speed off.
      this.cruising = false;
      this.lsTargetName = null;
      this.lsFree = false;
      this.lsFreeDir = null;
      this.lsBraking = true;
      this.lsSeq = endCruise(this.lsSeq);
      return;
    }
    if (tap === "abort") {
      // Second tap mid-wind-up: never happened.
      this.lsSeq = endCruise(this.lsSeq);
      this.lsTargetName = null;
      this.lsFree = false;
      return;
    }
    // Decide before touching anything: the old fling-first-validate-after
    // order bounced arrivals in an endless fling/cruise-back loop.
    const name = this.navmap.targetName;
    const target = name ? findBody(this.bodies, name) : null;
    const decision = jumpDecision({
      capturedBody: this.sling.kind === "captured" ? this.sling.bodyName : null,
      targetName: name,
      targetDist: target ? target.position.sub(this.ship.position).length() : Infinity,
      targetCaptureRadius: target ? target.captureRadius : 0,
      phaseKind: this.phase.kind,
    });
    if (decision === "none") return;
    if (decision === "land") {
      // You're already at the target — J finishes the trip.
      this.assistOn = true;
      return;
    }
    if (this.sling.kind === "captured") {
      // J while swinging: release the sling and jump in one motion — a bare
      // fling near a planet falls back inbound and recaptures forever.
      const body = findBody(this.bodies, this.sling.bodyName);
      const fling = releaseFling(this.sling, body, this.navTargetDirection());
      this.sling = fling.state;
      this.ship.velocity = fling.velocity;
      this.setOrient(fling.velocity.normalize());
      if (fling.snapped) this.lsGraceUntil = this.missionElapsed + 2;
      this.slingHeldPrev = false;
    }
    if (decision === "freeJump") {
      // No destination needed: charge up and fly wherever the nose points
      // (after a release, that's the fling direction — straight out of town).
      this.lsTargetName = null;
      this.lsFree = true;
      this.lsSeq = startCharge();
      return;
    }
    this.lsTargetName = name;
    if (this.missionElapsed <= this.lsGraceUntil) {
      // A perfect (snapped) sling release chains straight into the leap.
      this.lsSeq = startBurst();
      this.cruising = true;
      this.lsBraking = false;
      this.rig.resetLook();
    } else {
      this.lsSeq = startCharge();
    }
  }

  private toggleExit(): void {
    if (this.phase.kind === "landed" && !this.astronaut) {
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
      this.phase = transition(this.phase, { kind: "onFoot", body: this.phase.body });
    } else if (this.phase.kind === "onFoot" && this.astronaut) {
      this.astronaut = null;
      this.astronautGroup.visible = false;
      this.phase = transition(this.phase, { kind: "landed", body: this.phase.body });
    }
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }
}
