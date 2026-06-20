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
import { createInputManager, InputManager } from "../sim/input/InputManager";
import { selectPrimaryBody } from "./primaryBody";
import { rotateAttitude, thrustDirection } from "./attitude";
import { nextThrottle, shouldHoldOnSurface } from "./shipControl";

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
  }

  private stepSim(): void {
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
  }

  private frame = (t: number): void => {
    const dt = this.lastTime === 0 ? 0 : (t - this.lastTime) / 1000;
    this.lastTime = t;
    const { steps, next } = advance(this.tc, Math.min(dt, 0.1));
    this.tc = next;
    for (let i = 0; i < steps; i++) this.stepSim();

    this.fo = rebase(this.fo, this.ship.position);
    updateBodies(this.views, this.fo);

    const shipRender = toRender(this.fo, this.ship.position);
    const shipVec = new THREE.Vector3(shipRender.x, shipRender.y, shipRender.z);
    this.shipGroup.position.copy(shipVec);
    this.shipGroup.quaternion.copy(this.quat);
    this.rig.setCockpit(shipVec, this.quat);

    this.renderer.render();
    requestAnimationFrame(this.frame);
  };

  start(): void {
    requestAnimationFrame(this.frame);
  }
}
