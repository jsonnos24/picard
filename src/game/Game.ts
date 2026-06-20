import * as THREE from "three";
import { Renderer } from "../render/Renderer";
import { createBodies, updateBodies, BodyView } from "../render/scene/bodies";
import { createShip } from "../render/scene/ship";
import { CameraRig } from "../render/CameraRig";
import { createSolarSystem, Body } from "../sim/Body";
import {
  Spacecraft,
  createSpacecraft,
  toMotionState,
  applyMotionState,
} from "../sim/Spacecraft";
import { shipAccelFn } from "../sim/forces";
import { verletStep } from "../sim/integrator";
import { createTimeControl, advance, TimeControl } from "../sim/TimeControl";
import { FloatingOrigin, createFloatingOrigin, rebase, toRender } from "../sim/FloatingOrigin";
import { Vec3 } from "../sim/Vec3";

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
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(this.renderer.camera);
    this.bodies = createSolarSystem();
    this.views = createBodies(this.renderer.scene, this.bodies);
    this.shipGroup = createShip(this.renderer.scene).group;
    this.fo = createFloatingOrigin();
    this.tc = createTimeControl();

    // Spawn on Earth's "north pole" pad (+Y), resting on the surface.
    const earth = this.bodies[0];
    const padHeight = 7; // half ship height so legs touch
    this.ship = createSpacecraft(new Vec3(0, earth.radius + padHeight, 0));
    this.ship.orientation = new Vec3(0, 1, 0);

    window.addEventListener("resize", () => this.renderer.resize());
  }

  private stepSim(): void {
    // Rebuild the accel closure each step (it snapshots the ship).
    const accel = shipAccelFn(this.ship, this.bodies);
    const next = verletStep(toMotionState(this.ship), 1 / 60, accel);
    this.ship = applyMotionState(this.ship, next);

    // Landed-hold placeholder: until launch logic (Task 7), pin the ship on the pad.
    const earth = this.bodies[0];
    const up = this.ship.position.sub(earth.position);
    const alt = up.length() - earth.radius;
    if (alt < 7) {
      const n = up.normalize();
      this.ship.position = earth.position.add(n.scale(earth.radius + 7));
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
