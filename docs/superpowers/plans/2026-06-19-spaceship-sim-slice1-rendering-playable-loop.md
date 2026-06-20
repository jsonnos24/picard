# Galaxy Spaceship Simulator — Slice 1, Plan B: Rendering & Playable Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the merged headless simulation (Plan A) into the playable Earth→Moon vertical slice: a first-person cockpit you launch off Earth, fly or warp to the Moon, descend to a controlled airless landing, and step out to moonwalk — rendered with Three.js and verified by manual playtest.

**Architecture:** A thin presentation + integration layer on top of the pure `src/sim` API. Three.js owns rendering only; all world state stays in the sim's double-precision universe coordinates and is converted to render coordinates each frame via the existing `FloatingOrigin`. A single `Game` loop drives the fixed-timestep simulation, the `GameState` machine, and rendering. Genuinely testable logic (primary-body selection, attitude integration, landing/crash detection, phase triggers, screen-marker projection) is extracted into pure modules under `src/game/**` and unit-tested; rendering and "feel" are verified by playtest.

**Tech Stack:** TypeScript, Vite, Three.js (WebGL), Vitest. Builds on the merged `src/sim/**` library.

## Global Constraints

- Language: **TypeScript**, `strict: true` (already configured).
- Only `src/render/**` and the `THREE` import may touch Three.js or the DOM. `src/sim/**` stays pure (do not modify it except where a task explicitly says so). `src/game/**` logic modules that have unit tests must not import the DOM; they may import `three` only for math types (`Vector3`, `Quaternion`, `PerspectiveCamera`), which run headless under Node.
- All world positions/velocities remain in **metres / metres-per-second**, universe coordinates, as `Vec3`. Convert to render space only via `toRender(floatingOrigin, universePos)`.
- Render units: **1 Three.js unit = 1 metre**. Use `WebGLRenderer({ logarithmicDepthBuffer: true })`, camera `near = 0.1`, `far = 1e9` to span cockpit-to-planet scale.
- Three.js version: **`three@^0.169.0`** with **`@types/three@^0.169.0`**.
- Fixed simulation timestep is the sim's `FIXED_DT` (1/60 s) via `TimeControl`; rendering runs every animation frame.
- Tuning targets (playtest, not asserted): manual Earth→Moon ≈ **2–5 min**; warp ≈ **<10 s**; safe touchdown ≈ vertical speed < **5 m/s** and tilt < **10°**.
- Test runner: `npx vitest run`. Dev server: `npm run dev`. Commit after every task.

## Carry-over from Plan A's final review (address as noted below)
- Need a **primary-body selector** (which body am I above; my altitude) → Task 3.
- `shipAccelFn` **snapshots the ship at closure creation** → the loop must rebuild the closure each timestep (Task 5).
- Astronaut **air-strafe / airborne horizontal-velocity reset** is spec-mandated → confirm feel during Task 13 playtest.

---

## File Structure

```
index.html                         # Vite entry HTML, mounts the canvas + UI root
src/main.ts                        # bootstraps Game, starts the loop
src/render/
  Renderer.ts                      # wraps THREE scene/camera/renderer + resize + render()
  CameraRig.ts                     # first-person cockpit pose + down-view toggle
  scene/
    bodies.ts                      # Earth/Moon meshes, sun light, starfield; per-frame reposition
    ship.ts                        # ship exterior + cockpit interior meshes
    astronaut.ts                   # astronaut avatar mesh
    warpEffect.ts                  # star-streak warp visual
    dust.ts                        # landing dust puff
src/game/
  Game.ts                          # main loop: input -> sim step -> state -> render
  primaryBody.ts                   # nearest-body selector + altitude (PURE, tested)
  attitude.ts                      # intent -> orientation quaternion integration (tested)
  shipControl.ts                   # intent -> throttle/engine; landed hold logic (tested)
  phases.ts                        # phase-transition triggers (PURE, tested)
  landing.ts                       # touchdown vs crash evaluation (PURE, tested)
  markers.ts                       # world->screen projection + offscreen arrows (tested)
src/ui/
  HUD.ts                           # 2D overlay: altitude/speed/fuel/throttle/phase/warnings
  Instruments.ts                   # cockpit attitude + vertical-speed readouts
  NavMap.ts                        # overhead Earth-Moon schematic + target selection
  ui.css                           # overlay styling
tests/game/
  primaryBody.test.ts
  attitude.test.ts
  shipControl.test.ts
  phases.test.ts
  landing.test.ts
  markers.test.ts
```

---

### Task 1: Vite app entry + Three.js blank scene with starfield

**Files:**
- Modify: `package.json` (add `three`, `@types/three` deps)
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/render/Renderer.ts`
- Create: `src/render/scene/bodies.ts` (starfield only in this task)

**Interfaces:**
- Consumes: nothing from earlier Plan B tasks.
- Produces:
  - `class Renderer { scene: THREE.Scene; camera: THREE.PerspectiveCamera; constructor(canvas: HTMLCanvasElement); render(): void; resize(): void; }`
  - `function createStarfield(): THREE.Points` — 3000 points on a large sphere.

- [ ] **Step 1: Add Three.js dependencies**

Edit `package.json` `devDependencies` to add (keep existing entries):

```json
"three": "^0.169.0",
"@types/three": "^0.169.0"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: installs `three` and `@types/three`, exit 0.

- [ ] **Step 3: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Galaxy Spaceship Simulator</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
      #app { position: relative; width: 100vw; height: 100vh; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <div id="app"><canvas id="view"></canvas></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `src/render/scene/bodies.ts` (starfield only for now)**

```ts
import * as THREE from "three";

export function createStarfield(): THREE.Points {
  const count = 3000;
  const radius = 5e8; // far shell, in metres
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // deterministic-ish spread using trig of the index (no Math.random needed)
    const theta = (i * 2.399963) % (Math.PI * 2); // golden-angle spiral
    const y = 1 - (i / (count - 1)) * 2; // -1..1
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5e6, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}
```

- [ ] **Step 5: Create `src/render/Renderer.ts`**

```ts
import * as THREE from "three";
import { createStarfield } from "./scene/bodies";

export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.gl.setPixelRatio(window.devicePixelRatio);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1e9);
    this.scene.add(createStarfield());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h);
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
  }
}
```

- [ ] **Step 6: Create `src/main.ts`**

```ts
import { Renderer } from "./render/Renderer";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
window.addEventListener("resize", () => renderer.resize());

function loop(): void {
  renderer.render();
  requestAnimationFrame(loop);
}
loop();
```

- [ ] **Step 7: Manual verify**

Run: `npm run dev`, open the printed localhost URL.
Expected: a black screen filled with a field of white stars; no console errors; resizing the window keeps it full-screen. (Stop the dev server with Ctrl-C after confirming.)

- [ ] **Step 8: Verify the test suite still passes (no regressions to sim)**

Run: `npx vitest run`
Expected: PASS — existing 64 tests still green.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json index.html src/main.ts src/render/Renderer.ts src/render/scene/bodies.ts
git commit -m "feat: vite + three.js app shell with starfield"
```

---

### Task 2: Render Earth, Moon, and sunlight positioned via floating origin

**Files:**
- Modify: `src/render/scene/bodies.ts`
- Modify: `src/main.ts` (temporary preview wiring; replaced by Game in Task 5)

**Interfaces:**
- Consumes: `createSolarSystem` (`src/sim/Body`), `Body`, `Vec3`, `createFloatingOrigin`, `toRender` (`src/sim/FloatingOrigin`), `createStarfield` (Task 1).
- Produces:
  - `interface BodyView { body: Body; mesh: THREE.Mesh; }`
  - `function createBodies(scene: THREE.Scene, bodies: Body[]): BodyView[]` — adds a sphere mesh per body (real radius in metres) and a sun `DirectionalLight` + faint ambient; returns the views.
  - `function updateBodies(views: BodyView[], fo: { offset: Vec3 }): void` — sets each `mesh.position` to `toRender(fo, body.position)`.

- [ ] **Step 1: Replace `src/render/scene/bodies.ts` contents with starfield + bodies**

```ts
import * as THREE from "three";
import { Body } from "../../sim/Body";
import { Vec3 } from "../../sim/Vec3";
import { toRender } from "../../sim/FloatingOrigin";

export function createStarfield(): THREE.Points {
  const count = 3000;
  const radius = 5e8;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = (i * 2.399963) % (Math.PI * 2);
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5e6, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

export interface BodyView {
  body: Body;
  mesh: THREE.Mesh;
}

const BODY_COLORS: Record<string, number> = {
  Earth: 0x2a6cb0,
  Moon: 0x999999,
};

export function createBodies(scene: THREE.Scene, bodies: Body[]): BodyView[] {
  scene.add(new THREE.AmbientLight(0x202028));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(1, 0.3, 0.2).normalize();
  scene.add(sun);

  return bodies.map((body) => {
    const geo = new THREE.SphereGeometry(body.radius, 64, 48);
    const mat = new THREE.MeshStandardMaterial({
      color: BODY_COLORS[body.name] ?? 0x808080,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { body, mesh };
  });
}

export function updateBodies(views: BodyView[], fo: { offset: Vec3 }): void {
  for (const view of views) {
    const p = toRender(fo, view.body.position);
    view.mesh.position.set(p.x, p.y, p.z);
  }
}
```

- [ ] **Step 2: Temporary preview wiring in `src/main.ts`**

```ts
import { Renderer } from "./render/Renderer";
import { createBodies, updateBodies } from "./render/scene/bodies";
import { createSolarSystem } from "./sim/Body";
import { createFloatingOrigin } from "./sim/FloatingOrigin";
import { Vec3 } from "./sim/Vec3";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
window.addEventListener("resize", () => renderer.resize());

const bodies = createSolarSystem();
const views = createBodies(renderer.scene, bodies);
const fo = createFloatingOrigin();

// Park the camera just above Earth's surface looking toward the Moon (+x).
const earth = bodies[0];
fo.offset = new Vec3(0, earth.radius + 2e6, 0); // pretend the player is here
renderer.camera.position.set(0, 0, 0);
renderer.camera.lookAt(bodies[1].position.x, 0, 0);

function loop(): void {
  updateBodies(views, fo);
  renderer.render();
  requestAnimationFrame(loop);
}
loop();
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`.
Expected: a large blue-grey Earth sphere fills part of the view, a smaller grey Moon is visible in the distance toward +x, lit from one side by the sun with a dark night side; stars behind. No depth-fighting/flicker (log depth buffer working). Ctrl-C when confirmed.

- [ ] **Step 4: Verify suite still green**

Run: `npx vitest run`
Expected: PASS — 64 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/scene/bodies.ts src/main.ts
git commit -m "feat: render Earth, Moon, sunlight via floating origin"
```

---

### Task 3: Primary-body selector (pure, tested)

**Files:**
- Create: `src/game/primaryBody.ts`
- Test: `tests/game/primaryBody.test.ts`

**Interfaces:**
- Consumes: `Vec3` (`src/sim/Vec3`), `Body` (`src/sim/Body`).
- Produces:
  ```ts
  interface PrimaryBody { body: Body; altitude: number; up: Vec3; }
  // Returns the body whose SURFACE is nearest the position, the altitude above
  // that surface (metres, may be negative if below), and the local up unit vector
  // (from body center toward position).
  function selectPrimaryBody(position: Vec3, bodies: Body[]): PrimaryBody;
  ```

- [ ] **Step 1: Write the failing test `tests/game/primaryBody.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { selectPrimaryBody } from "../../src/game/primaryBody";
import { createSolarSystem } from "../../src/sim/Body";
import { Vec3 } from "../../src/sim/Vec3";

describe("selectPrimaryBody", () => {
  it("picks Earth and reports altitude near Earth's surface", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];
    const pos = new Vec3(0, earth.radius + 1000, 0);
    const pb = selectPrimaryBody(pos, bodies);
    expect(pb.body.name).toBe("Earth");
    expect(pb.altitude).toBeCloseTo(1000, 0);
  });

  it("picks the Moon when near the Moon's surface", () => {
    const bodies = createSolarSystem();
    const moon = bodies[1];
    const pos = moon.position.add(new Vec3(0, moon.radius + 500, 0));
    const pb = selectPrimaryBody(pos, bodies);
    expect(pb.body.name).toBe("Moon");
    expect(pb.altitude).toBeCloseTo(500, 0);
  });

  it("reports local up as the unit vector from body center to position", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];
    const pos = new Vec3(0, earth.radius + 1000, 0);
    const pb = selectPrimaryBody(pos, bodies);
    expect(pb.up.x).toBeCloseTo(0, 6);
    expect(pb.up.y).toBeCloseTo(1, 6);
    expect(pb.up.z).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/primaryBody.test.ts`
Expected: FAIL — cannot find module `primaryBody`.

- [ ] **Step 3: Implement `src/game/primaryBody.ts`**

```ts
import { Vec3 } from "../sim/Vec3";
import { Body } from "../sim/Body";

export interface PrimaryBody {
  body: Body;
  altitude: number;
  up: Vec3;
}

export function selectPrimaryBody(position: Vec3, bodies: Body[]): PrimaryBody {
  let best: PrimaryBody | null = null;
  for (const body of bodies) {
    const toPos = position.sub(body.position);
    const dist = toPos.length();
    const altitude = dist - body.radius;
    if (best === null || altitude < best.altitude) {
      best = { body, altitude, up: dist === 0 ? new Vec3(0, 1, 0) : toPos.scale(1 / dist) };
    }
  }
  // bodies is never empty in this game, but satisfy the type:
  if (best === null) throw new Error("no bodies provided");
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/primaryBody.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/primaryBody.ts tests/game/primaryBody.test.ts
git commit -m "feat: add primary-body selector with altitude and local up"
```

---

### Task 4: Attitude control (intent → orientation quaternion, tested)

**Files:**
- Create: `src/game/attitude.ts`
- Test: `tests/game/attitude.test.ts`

**Interfaces:**
- Consumes: `Vec3` (`src/sim/Vec3`), `InputManager` + `Intent` (`src/sim/input/InputManager`, `src/sim/input/bindings`), `THREE.Quaternion`.
- Produces:
  ```ts
  // Rotational state of the ship as a quaternion plus the body axes it implies.
  // ROT_RATE (rad/s) is the RCS turn rate. Reads pitch/yaw/roll intents from the
  // InputManager's isActive() and integrates the quaternion by dt.
  const ROT_RATE = 0.6;
  function rotateAttitude(q: THREE.Quaternion, im: { isActive(i: Intent): boolean }, dt: number): THREE.Quaternion;
  // The ship's thrust direction = its local +Y axis rotated by q, as a sim Vec3.
  function thrustDirection(q: THREE.Quaternion): Vec3;
  ```

- [ ] **Step 1: Write the failing test `tests/game/attitude.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { rotateAttitude, thrustDirection, ROT_RATE } from "../../src/game/attitude";
import { Intent } from "../../src/sim/input/bindings";

function fakeInput(active: Intent[]) {
  return { isActive: (i: Intent) => active.includes(i) };
}

describe("attitude", () => {
  it("thrustDirection of identity quaternion is +Y", () => {
    const d = thrustDirection(new THREE.Quaternion());
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(1, 6);
    expect(d.z).toBeCloseTo(0, 6);
  });

  it("does nothing when no rotation intents are active", () => {
    const q0 = new THREE.Quaternion();
    const q1 = rotateAttitude(q0, fakeInput([]), 1);
    expect(q1.angleTo(q0)).toBeCloseTo(0, 6);
  });

  it("pitch rotates the thrust direction away from +Y by ROT_RATE*dt", () => {
    const q1 = rotateAttitude(new THREE.Quaternion(), fakeInput(["pitchUp"]), 1);
    const d = thrustDirection(q1);
    const up = new THREE.Vector3(0, 1, 0);
    const angle = up.angleTo(new THREE.Vector3(d.x, d.y, d.z));
    expect(angle).toBeCloseTo(ROT_RATE, 2);
  });

  it("does not mutate the input quaternion", () => {
    const q0 = new THREE.Quaternion();
    rotateAttitude(q0, fakeInput(["yawLeft"]), 1);
    expect(q0.x).toBe(0);
    expect(q0.y).toBe(0);
    expect(q0.z).toBe(0);
    expect(q0.w).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/attitude.test.ts`
Expected: FAIL — cannot find module `attitude`.

- [ ] **Step 3: Implement `src/game/attitude.ts`**

```ts
import * as THREE from "three";
import { Vec3 } from "../sim/Vec3";
import { Intent } from "../sim/input/bindings";

export const ROT_RATE = 0.6; // rad/s

interface AttitudeInput {
  isActive(i: Intent): boolean;
}

export function rotateAttitude(q: THREE.Quaternion, im: AttitudeInput, dt: number): THREE.Quaternion {
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  if (im.isActive("pitchUp")) pitch += 1;
  if (im.isActive("pitchDown")) pitch -= 1;
  if (im.isActive("yawLeft")) yaw += 1;
  if (im.isActive("yawRight")) yaw -= 1;
  if (im.isActive("rollLeft")) roll += 1;
  if (im.isActive("rollRight")) roll -= 1;

  const result = q.clone();
  const step = ROT_RATE * dt;
  // Body-relative rotations: X = pitch, Y = roll (around thrust axis), Z = yaw.
  if (pitch !== 0) result.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch * step));
  if (yaw !== 0) result.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw * step));
  if (roll !== 0) result.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll * step));
  return result.normalize();
}

export function thrustDirection(q: THREE.Quaternion): Vec3 {
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return new Vec3(v.x, v.y, v.z);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/attitude.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/attitude.ts tests/game/attitude.test.ts
git commit -m "feat: add attitude control (intent -> orientation quaternion)"
```

---

### Task 5: Game loop skeleton — fixed-step sim + render, ship at rest on the pad

**Files:**
- Create: `src/render/CameraRig.ts`
- Create: `src/render/scene/ship.ts`
- Create: `src/game/Game.ts`
- Modify: `src/main.ts` (use Game)

**Interfaces:**
- Consumes: `Renderer` (Task 1), `createBodies`/`updateBodies` (Task 2), `selectPrimaryBody` (Task 3), `thrustDirection` (Task 4); sim: `createSolarSystem`, `createSpacecraft`, `Spacecraft`, `toMotionState`/`applyMotionState`, `shipAccelFn`, `verletStep`, `createTimeControl`/`advance`, `createFloatingOrigin`/`rebase`/`toRender`, `Vec3`, `FIXED_DT`.
- Produces:
  - `class CameraRig { constructor(camera: THREE.PerspectiveCamera); setCockpit(shipRenderPos: THREE.Vector3, shipQuat: THREE.Quaternion): void; }`
  - `function createShip(scene: THREE.Scene): { group: THREE.Group }` — a simple lander mesh (body + legs) plus a cockpit frame.
  - `class Game { constructor(canvas: HTMLCanvasElement); start(): void; }`
  - Inside `Game`, the per-frame order is: advance TimeControl → for each fixed step, build `shipAccelFn(ship, bodies)` fresh and `verletStep`; apply landed-hold (Task 7 refines) → `rebase` floating origin to ship → `updateBodies` → position ship mesh + camera.

- [ ] **Step 1: Create `src/render/scene/ship.ts`**

```ts
import * as THREE from "three";

export function createShip(scene: THREE.Scene): { group: THREE.Group } {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(2, 5, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 }),
  );
  group.add(body);

  // three landing legs
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 2.5, -3.5, Math.sin(a) * 2.5);
    leg.rotation.z = Math.cos(a) * 0.4;
    leg.rotation.x = Math.sin(a) * 0.4;
    group.add(leg);
  }

  scene.add(group);
  return { group };
}
```

- [ ] **Step 2: Create `src/render/CameraRig.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/game/Game.ts`**

```ts
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
```

- [ ] **Step 4: Replace `src/main.ts`**

```ts
import { Game } from "./game/Game";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const game = new Game(canvas);
game.start();
```

- [ ] **Step 5: Manual verify**

Run: `npm run dev`.
Expected: you are sitting on Earth's surface in first-person; the horizon curves away; the ship stays put (gravity is balanced by the landed-hold), no falling-through-the-planet, no jitter. The Moon is visible far off. Ctrl-C when confirmed.

- [ ] **Step 6: Verify suite still green**

Run: `npx vitest run`
Expected: PASS — all tests (64 sim + Tasks 3–4 game tests).

- [ ] **Step 7: Commit**

```bash
git add src/render/CameraRig.ts src/render/scene/ship.ts src/game/Game.ts src/main.ts
git commit -m "feat: game loop with fixed-step sim, ship resting on Earth pad"
```

---

### Task 6: Ship control (throttle/engine intents, landed-hold) — tested

**Files:**
- Create: `src/game/shipControl.ts`
- Test: `tests/game/shipControl.test.ts`

**Interfaces:**
- Consumes: `Spacecraft` (`src/sim/Spacecraft`), `Intent` + `InputManager` shape.
- Produces:
  ```ts
  const THROTTLE_RATE = 0.8; // per second
  // Pure: returns a NEW throttle value clamped 0..1 given held throttle intents.
  function nextThrottle(throttle: number, im: { isActive(i: Intent): boolean }, dt: number): number;
  // Pure: should the ship be held on the surface? True when landed AND current
  // thrust acceleration can't overcome local gravity (so it won't lift off yet).
  function shouldHoldOnSurface(thrustAccelMag: number, surfaceGravity: number): boolean;
  ```

- [ ] **Step 1: Write the failing test `tests/game/shipControl.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { nextThrottle, shouldHoldOnSurface, THROTTLE_RATE } from "../../src/game/shipControl";
import { Intent } from "../../src/sim/input/bindings";

function fakeInput(active: Intent[]) {
  return { isActive: (i: Intent) => active.includes(i) };
}

describe("shipControl", () => {
  it("raises throttle while throttleUp is held", () => {
    expect(nextThrottle(0, fakeInput(["throttleUp"]), 0.5)).toBeCloseTo(THROTTLE_RATE * 0.5, 6);
  });

  it("lowers throttle while throttleDown is held", () => {
    expect(nextThrottle(1, fakeInput(["throttleDown"]), 0.5)).toBeCloseTo(1 - THROTTLE_RATE * 0.5, 6);
  });

  it("clamps throttle to [0,1]", () => {
    expect(nextThrottle(1, fakeInput(["throttleUp"]), 5)).toBe(1);
    expect(nextThrottle(0, fakeInput(["throttleDown"]), 5)).toBe(0);
  });

  it("holds on surface only when thrust can't beat gravity", () => {
    expect(shouldHoldOnSurface(5, 9.81)).toBe(true);
    expect(shouldHoldOnSurface(12, 9.81)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/shipControl.test.ts`
Expected: FAIL — cannot find module `shipControl`.

- [ ] **Step 3: Implement `src/game/shipControl.ts`**

```ts
import { Intent } from "../sim/input/bindings";

export const THROTTLE_RATE = 0.8; // per second

interface ControlInput {
  isActive(i: Intent): boolean;
}

export function nextThrottle(throttle: number, im: ControlInput, dt: number): number {
  let t = throttle;
  if (im.isActive("throttleUp")) t += THROTTLE_RATE * dt;
  if (im.isActive("throttleDown")) t -= THROTTLE_RATE * dt;
  return Math.max(0, Math.min(1, t));
}

export function shouldHoldOnSurface(thrustAccelMag: number, surfaceGravity: number): boolean {
  return thrustAccelMag <= surfaceGravity;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/shipControl.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Wire input + controls into `src/game/Game.ts`**

Add imports at the top:

```ts
import { createInputManager, InputManager } from "../sim/input/InputManager";
import { thrustAccel as shipThrustAccel, totalMass } from "../sim/Spacecraft";
import { surfaceGravity } from "../sim/Body";
import { selectPrimaryBody } from "./primaryBody";
import { rotateAttitude, thrustDirection } from "./attitude";
import { nextThrottle, shouldHoldOnSurface } from "./shipControl";
```

Add a field and DOM wiring in the constructor (after `this.tc = createTimeControl();`):

```ts
    this.input = createInputManager();
    window.addEventListener("keydown", (e) => this.input.handleKey(e.code, true));
    window.addEventListener("keyup", (e) => this.input.handleKey(e.code, false));
```

Add the field declaration with the others: `private input!: InputManager;`

Replace `stepSim()` with control-aware logic:

```ts
  private stepSim(): void {
    const dt = 1 / 60;
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
    if (pb.altitude < 7 && shouldHoldOnSurface(thrustMag, surfaceGravity(pb.body))) {
      this.ship.position = pb.body.position.add(pb.up.scale(pb.body.radius + 7));
      this.ship.velocity = Vec3.zero();
    }
  }
```

Add `burnFuel` to the Spacecraft import line:

```ts
import { Spacecraft, createSpacecraft, toMotionState, applyMotionState, burnFuel } from "../sim/Spacecraft";
```

- [ ] **Step 6: Manual verify**

Run: `npm run dev`. Hold **W** to raise throttle.
Expected: throttle builds; once thrust beats Earth gravity the lander lifts off the pad and climbs; **S** lowers throttle and you settle/descend; arrow keys + A/D/Q/E rotate the view/ship. Releasing W mid-air, gravity pulls you back down. Ctrl-C when confirmed.

- [ ] **Step 7: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/game/shipControl.ts tests/game/shipControl.test.ts src/game/Game.ts
git commit -m "feat: ship throttle/attitude control and launch off the pad"
```

---

### Task 7: Phase transitions (pure, tested) + wire into the loop

**Files:**
- Create: `src/game/phases.ts`
- Test: `tests/game/phases.test.ts`
- Modify: `src/game/Game.ts`

**Interfaces:**
- Consumes: `Phase`, `canTransition` (`src/sim/GameState`).
- Produces:
  ```ts
  interface PhaseContext {
    phase: Phase;
    altitude: number;       // above primary body surface, m
    inAtmosphere: boolean;  // primary body has atmosphere AND altitude < atmosphereTop
    primaryName: string;    // "Earth" | "Moon"
    launched: boolean;      // has left the pad (altitude > LAUNCH_CLEAR)
  }
  // Returns the next phase given context, or the same phase if no transition applies.
  // Only returns transitions allowed by GameState.canTransition.
  function nextPhase(ctx: PhaseContext): Phase;
  const SPACE_ALTITUDE = 1.0e5;   // 100 km: boundary of "space"
  const LAUNCH_CLEAR = 50;        // m above pad to count as launched
  ```
  Rules: `LandedEarth`→`Launching` when `launched`; `Launching`→`InSpace` when `altitude > SPACE_ALTITUDE` over Earth; `InSpace`→`Descending` when over the Moon and `altitude < SPACE_ALTITUDE`; `Descending`→`InSpace` when `altitude > SPACE_ALTITUDE` again (abort). Landing/crash transitions (`Descending`→`LandedMoon`) are handled in Task 9, not here.

- [ ] **Step 1: Write the failing test `tests/game/phases.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { nextPhase, SPACE_ALTITUDE, LAUNCH_CLEAR } from "../../src/game/phases";

const base = { altitude: 0, inAtmosphere: true, primaryName: "Earth", launched: false };

describe("nextPhase", () => {
  it("LandedEarth -> Launching once launched", () => {
    expect(nextPhase({ ...base, phase: "LandedEarth", launched: false })).toBe("LandedEarth");
    expect(nextPhase({ ...base, phase: "LandedEarth", launched: true, altitude: LAUNCH_CLEAR + 1 })).toBe("Launching");
  });

  it("Launching -> InSpace above the space altitude", () => {
    expect(nextPhase({ ...base, phase: "Launching", altitude: SPACE_ALTITUDE + 1, launched: true })).toBe("InSpace");
    expect(nextPhase({ ...base, phase: "Launching", altitude: SPACE_ALTITUDE - 1, launched: true })).toBe("Launching");
  });

  it("InSpace -> Descending when low over the Moon", () => {
    expect(nextPhase({ ...base, phase: "InSpace", primaryName: "Moon", altitude: SPACE_ALTITUDE - 1, inAtmosphere: false })).toBe("Descending");
    expect(nextPhase({ ...base, phase: "InSpace", primaryName: "Moon", altitude: SPACE_ALTITUDE + 1, inAtmosphere: false })).toBe("InSpace");
  });

  it("Descending -> InSpace when climbing back out (abort)", () => {
    expect(nextPhase({ ...base, phase: "Descending", primaryName: "Moon", altitude: SPACE_ALTITUDE + 1, inAtmosphere: false })).toBe("InSpace");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/phases.test.ts`
Expected: FAIL — cannot find module `phases`.

- [ ] **Step 3: Implement `src/game/phases.ts`**

```ts
import { Phase, canTransition } from "../sim/GameState";

export const SPACE_ALTITUDE = 1.0e5; // 100 km
export const LAUNCH_CLEAR = 50; // m

export interface PhaseContext {
  phase: Phase;
  altitude: number;
  inAtmosphere: boolean;
  primaryName: string;
  launched: boolean;
}

export function nextPhase(ctx: PhaseContext): Phase {
  const want = desired(ctx);
  if (want !== ctx.phase && canTransition(ctx.phase, want)) return want;
  return ctx.phase;
}

function desired(ctx: PhaseContext): Phase {
  switch (ctx.phase) {
    case "LandedEarth":
      return ctx.launched && ctx.altitude > LAUNCH_CLEAR ? "Launching" : "LandedEarth";
    case "Launching":
      return ctx.altitude > SPACE_ALTITUDE ? "InSpace" : "Launching";
    case "InSpace":
      return ctx.primaryName === "Moon" && ctx.altitude < SPACE_ALTITUDE ? "Descending" : "InSpace";
    case "Descending":
      return ctx.altitude > SPACE_ALTITUDE ? "InSpace" : "Descending";
    default:
      return ctx.phase;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/phases.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Wire phase tracking into `src/game/Game.ts`**

Add imports:

```ts
import { Phase, initialPhase } from "../sim/GameState";
import { nextPhase } from "./phases";
```

Add fields: `private phase: Phase = initialPhase();`

At the end of `stepSim()`, after the landed-hold block, add:

```ts
    const pb2 = selectPrimaryBody(this.ship.position, this.bodies);
    const atmoTop = pb2.body.atmosphere ? pb2.body.atmosphere.scaleHeight * 10 : 0;
    this.phase = nextPhase({
      phase: this.phase,
      altitude: pb2.altitude,
      inAtmosphere: pb2.altitude < atmoTop,
      primaryName: pb2.body.name,
      launched: pb2.altitude > 50,
    });
```

(You may reuse the `pb` already computed in the landed-hold block instead of recomputing — keep one `selectPrimaryBody` call per step.)

- [ ] **Step 6: Manual verify (temporary console log)**

Temporarily add `console.log(this.phase)` at the end of `stepSim`, run `npm run dev`, launch straight up holding W.
Expected: phase logs progress `LandedEarth` → `Launching` → `InSpace` as you climb past 100 km. Remove the `console.log` after confirming. Ctrl-C.

- [ ] **Step 7: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/game/phases.ts tests/game/phases.test.ts src/game/Game.ts
git commit -m "feat: phase-transition logic wired into the game loop"
```

---

### Task 8: HUD overlay + cockpit instruments

**Files:**
- Create: `src/ui/ui.css`
- Create: `src/ui/HUD.ts`
- Modify: `index.html` (link the stylesheet + add UI root)
- Modify: `src/game/Game.ts` (update HUD each frame)

**Interfaces:**
- Consumes: `Spacecraft`, `selectPrimaryBody`, `Phase`, `Vec3`.
- Produces:
  ```ts
  interface HudState {
    phase: string; altitude: number; speed: number; verticalSpeed: number;
    fuelFraction: number; throttle: number; warning: string | null;
  }
  class HUD { constructor(root: HTMLElement); update(s: HudState): void; }
  ```
  Vertical speed = velocity · local-up (negative = descending). Warning text:
  `"HIGH DESCENT RATE"` when `verticalSpeed < -5` and `altitude < 5000`, else null.

- [ ] **Step 1: Create `src/ui/ui.css`**

```css
#ui { position: absolute; inset: 0; pointer-events: none; font-family: "Courier New", monospace; color: #9cf; }
#hud { position: absolute; left: 16px; bottom: 16px; font-size: 14px; line-height: 1.5;
       text-shadow: 0 0 4px #000; background: rgba(0,0,20,0.35); padding: 10px 14px; border: 1px solid #2a3; }
#hud .warn { color: #f55; font-weight: bold; }
#hud .row b { color: #cef; }
```

- [ ] **Step 2: Create `src/ui/HUD.ts`**

```ts
export interface HudState {
  phase: string;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  fuelFraction: number;
  throttle: number;
  warning: string | null;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + " km";
  return n.toFixed(0) + " m";
}

export class HUD {
  private readonly el: HTMLDivElement;
  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "hud";
    root.appendChild(this.el);
  }

  update(s: HudState): void {
    this.el.innerHTML =
      `<div class="row">PHASE <b>${s.phase}</b></div>` +
      `<div class="row">ALT <b>${fmt(s.altitude)}</b></div>` +
      `<div class="row">SPD <b>${s.speed.toFixed(0)} m/s</b></div>` +
      `<div class="row">V/S <b>${s.verticalSpeed.toFixed(1)} m/s</b></div>` +
      `<div class="row">FUEL <b>${(s.fuelFraction * 100).toFixed(0)}%</b></div>` +
      `<div class="row">THR <b>${(s.throttle * 100).toFixed(0)}%</b></div>` +
      (s.warning ? `<div class="row warn">${s.warning}</div>` : "");
  }
}
```

- [ ] **Step 3: Modify `index.html`** — add inside `<head>`:

```html
    <link rel="stylesheet" href="/src/ui/ui.css" />
```

and change the `#app` div to include a UI root:

```html
    <div id="app"><canvas id="view"></canvas><div id="ui"></div></div>
```

- [ ] **Step 4: Wire HUD into `src/game/Game.ts`**

Add import: `import { HUD } from "../ui/HUD";`
Add field: `private hud!: HUD;`
In the constructor: `this.hud = new HUD(document.getElementById("ui")!);`
Add a helper and call it each frame (in `frame`, before `this.renderer.render()`):

```ts
    this.updateHud();
```

```ts
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
```

(`initialFuel` matches `createSpacecraft`'s starting `fuelMass`. If that constant changes, update here.)

- [ ] **Step 5: Manual verify**

Run: `npm run dev`. Launch with W.
Expected: HUD shows phase, altitude climbing, speed, vertical speed, fuel draining as you burn, throttle %. Descending fast near the ground shows the red HIGH DESCENT RATE warning. Ctrl-C.

- [ ] **Step 6: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/ui.css src/ui/HUD.ts index.html src/game/Game.ts
git commit -m "feat: HUD overlay with altitude/speed/fuel/throttle/warnings"
```

---

### Task 9: Landing & crash detection (pure, tested) + reset

**Files:**
- Create: `src/game/landing.ts`
- Test: `tests/game/landing.test.ts`
- Modify: `src/game/Game.ts`

**Interfaces:**
- Consumes: `Vec3`, `Spacecraft`, `Body`, `selectPrimaryBody`.
- Produces:
  ```ts
  type Touchdown = "flying" | "landed" | "crash";
  const SAFE_VSPEED = 5;     // m/s max descent at touchdown
  const SAFE_TILT = 0.1745;  // ~10 degrees in radians
  // contactAltitude: altitude at/below which legs touch (e.g. 7 m).
  // tilt: angle (rad) between ship thrust axis and local up.
  function evaluateTouchdown(
    altitude: number, verticalSpeed: number, tilt: number, contactAltitude: number
  ): Touchdown;
  ```
  Rules: above `contactAltitude` → `flying`; at/below it → `landed` if
  `verticalSpeed >= -SAFE_VSPEED` AND `tilt <= SAFE_TILT`, else `crash`.

- [ ] **Step 1: Write the failing test `tests/game/landing.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluateTouchdown, SAFE_VSPEED, SAFE_TILT } from "../../src/game/landing";

const CONTACT = 7;

describe("evaluateTouchdown", () => {
  it("is flying while above contact altitude", () => {
    expect(evaluateTouchdown(100, -2, 0, CONTACT)).toBe("flying");
  });

  it("lands on a soft, upright touchdown", () => {
    expect(evaluateTouchdown(CONTACT, -(SAFE_VSPEED - 1), 0, CONTACT)).toBe("landed");
  });

  it("crashes when descending too fast", () => {
    expect(evaluateTouchdown(CONTACT, -(SAFE_VSPEED + 5), 0, CONTACT)).toBe("crash");
  });

  it("crashes when tilted too far even if slow", () => {
    expect(evaluateTouchdown(CONTACT, -1, SAFE_TILT + 0.1, CONTACT)).toBe("crash");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/landing.test.ts`
Expected: FAIL — cannot find module `landing`.

- [ ] **Step 3: Implement `src/game/landing.ts`**

```ts
export type Touchdown = "flying" | "landed" | "crash";

export const SAFE_VSPEED = 5; // m/s
export const SAFE_TILT = 0.1745; // ~10 deg

export function evaluateTouchdown(
  altitude: number,
  verticalSpeed: number,
  tilt: number,
  contactAltitude: number,
): Touchdown {
  if (altitude > contactAltitude) return "flying";
  if (verticalSpeed >= -SAFE_VSPEED && tilt <= SAFE_TILT) return "landed";
  return "crash";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/landing.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Wire landing/crash + reset into `src/game/Game.ts`**

Add imports:

```ts
import { evaluateTouchdown } from "./landing";
import { transition } from "../sim/GameState";
```

Add a reset helper and a Moon-contact check. In `stepSim()`, replace the Earth-only landed-hold with a generic version that also detects Moon touchdown when `Descending`:

```ts
    // After integrating + phase update, evaluate surface contact.
    const pbNow = selectPrimaryBody(this.ship.position, this.bodies);
    const vUp = this.ship.velocity.dot(pbNow.up);
    const tilt = Math.acos(Math.max(-1, Math.min(1, this.ship.orientation.normalize().dot(pbNow.up))));
    const contact = 7;

    if (this.phase === "Descending") {
      const result = evaluateTouchdown(pbNow.altitude, vUp, tilt, contact);
      if (result === "landed") {
        this.snapToSurface(pbNow.body, pbNow.up, contact);
        this.phase = transition("Descending", "LandedMoon");
      } else if (result === "crash") {
        this.resetToPad();
      }
    }
```

Add helpers:

```ts
  private snapToSurface(body: Body, up: Vec3, contact: number): void {
    this.ship.position = body.position.add(up.scale(body.radius + contact));
    this.ship.velocity = Vec3.zero();
  }

  private resetToPad(): void {
    const earth = this.bodies[0];
    this.ship = createSpacecraft(new Vec3(0, earth.radius + 7, 0));
    this.ship.orientation = new Vec3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.phase = initialPhase();
  }
```

(Keep the existing Earth landed-hold for the `LandedEarth`/pre-launch case; the Descending branch handles Moon arrival.)

- [ ] **Step 6: Manual verify (with warp not yet built, test crash/reset by flying down)**

Run: `npm run dev`. Launch, pitch over, fly toward and descend onto Earth fast.
Expected: slamming the surface fast/tilted resets you to the pad (clean restart, no penalty). A gentle vertical touchdown while in a descending phase settles you. (Full Moon arrival is exercised after Task 10's warp.) Ctrl-C.

- [ ] **Step 7: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/game/landing.ts tests/game/landing.test.ts src/game/Game.ts
git commit -m "feat: landing/crash detection with soft-reset to pad"
```

---

### Task 10: NavMap + warp to the Moon

**Files:**
- Create: `src/ui/NavMap.ts`
- Create: `src/render/scene/warpEffect.ts`
- Modify: `src/ui/ui.css`
- Modify: `src/game/Game.ts`

**Interfaces:**
- Consumes: `Body`, `Vec3`, `createSolarSystem`, `warpTo` + `safeApproachDistance` (`src/sim/WarpDrive`), `InputManager.consumePressed`, `Spacecraft`.
- Produces:
  - `class NavMap { constructor(root: HTMLElement, bodies: Body[]); toggle(): void; get isOpen(): boolean; setTarget(name: string): void; get targetName(): string | null; update(shipPos: Vec3): void; }` — a fixed overhead schematic (canvas) of Earth+Moon+ship; clicking a body sets the target.
  - `function createWarpEffect(scene: THREE.Scene): { play(): void; update(dt: number): void }` — brief star-streak flash.

- [ ] **Step 1: Add NavMap styles to `src/ui/ui.css`**

```css
#navmap { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
          width: 480px; height: 360px; background: rgba(0,0,20,0.85); border: 1px solid #3a6;
          pointer-events: auto; display: none; }
#navmap.open { display: block; }
#navmap canvas { width: 100%; height: 100%; cursor: crosshair; }
#navmap .title { position: absolute; top: 6px; left: 10px; color: #9cf; font: 12px monospace; }
```

- [ ] **Step 2: Create `src/ui/NavMap.ts`**

```ts
import { Body } from "../sim/Body";
import { Vec3 } from "../sim/Vec3";

export class NavMap {
  private readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private open = false;
  private target: string | null = null;
  private shipPos = new Vec3();
  private readonly hit: { name: string; x: number; y: number }[] = [];

  constructor(root: HTMLElement, private readonly bodies: Body[]) {
    this.el = document.createElement("div");
    this.el.id = "navmap";
    this.el.innerHTML = `<div class="title">NAV MAP — click a body to target</div>`;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 480;
    this.canvas.height = 360;
    this.el.appendChild(this.canvas);
    root.appendChild(this.el);
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("click", (e) => this.onClick(e));
  }

  get isOpen(): boolean { return this.open; }
  get targetName(): string | null { return this.target; }
  setTarget(name: string): void { this.target = name; }

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle("open", this.open);
  }

  update(shipPos: Vec3): void {
    this.shipPos = shipPos;
    if (this.open) this.draw();
  }

  private worldToMap(x: number): { px: number; py: number } {
    // Map the Earth-Moon line (0..moon.x) across the canvas width with margins.
    const moonX = this.bodies[1].position.x;
    const margin = 60;
    const px = margin + (x / moonX) * (this.canvas.width - 2 * margin);
    return { px, py: this.canvas.height / 2 };
  }

  private draw(): void {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hit.length = 0;
    for (const b of this.bodies) {
      const { px, py } = this.worldToMap(b.position.x);
      c.fillStyle = b.name === this.target ? "#6f6" : "#9cf";
      c.beginPath();
      c.arc(px, py, b.name === "Earth" ? 14 : 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#9cf";
      c.font = "11px monospace";
      c.fillText(b.name, px - 12, py + 26);
      this.hit.push({ name: b.name, x: px, y: py });
    }
    // ship marker
    const s = this.worldToMap(this.shipPos.x);
    c.fillStyle = "#ff6";
    c.fillRect(s.px - 2, s.py - 2, 4, 4);
  }

  private onClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    for (const h of this.hit) {
      if (Math.hypot(h.x - x, h.y - y) < 20) {
        this.target = h.name;
        this.draw();
        return;
      }
    }
  }
}
```

- [ ] **Step 3: Create `src/render/scene/warpEffect.ts`**

```ts
import * as THREE from "three";

export function createWarpEffect(scene: THREE.Scene): { play(): void; update(dt: number): void } {
  const mat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let t = 0;
  return {
    play(): void { t = 0.6; },
    update(dt: number): void {
      if (t > 0) t = Math.max(0, t - dt);
      mat.opacity = t; // simple flash; replace with a streak shader later
      // keep the flash centered on the camera
      mesh.position.copy(scene.getObjectByProperty("isCamera", true)?.position ?? mesh.position);
    },
  };
}
```

(If `getObjectByProperty` for the camera is awkward, the `Game` can instead set `mesh.position` to the camera each frame; the flash is full-screen-ish and position is not critical.)

- [ ] **Step 4: Wire NavMap + warp into `src/game/Game.ts`**

Add imports:

```ts
import { NavMap } from "../ui/NavMap";
import { warpTo } from "../sim/WarpDrive";
import { createWarpEffect } from "../render/scene/warpEffect";
```

Add fields:

```ts
  private navmap!: NavMap;
  private warpFx!: { play(): void; update(dt: number): void };
```

In the constructor:

```ts
    this.navmap = new NavMap(document.getElementById("ui")!, this.bodies);
    this.warpFx = createWarpEffect(this.renderer.scene);
```

In `frame`, handle the map/warp intents (edge-triggered) once per frame BEFORE stepping:

```ts
    if (this.input.consumePressed("openMap")) this.navmap.toggle();
    if (this.input.consumePressed("warp")) this.doWarp();
    this.navmap.update(this.ship.position);
    this.warpFx.update(dt);
```

Add the warp method:

```ts
  private doWarp(): void {
    const name = this.navmap.targetName;
    if (!name) return;
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
    if (this.phase === "InSpace" || this.phase === "Launching" || this.phase === "LandedEarth") {
      // ensure we're in a fl-ight phase after warp
      this.phase = "InSpace";
    }
  }
```

(Note: setting `this.phase = "InSpace"` directly here is a deliberate post-warp snap; `nextPhase` then takes over to trigger `Descending` as you approach the Moon.)

- [ ] **Step 5: Manual verify**

Run: `npm run dev`. Launch to space (hold W past 100 km), press **M** to open the nav map, click the **Moon**, press **M** to close, press **J** to warp.
Expected: a brief flash; you arrive near the Moon (it's now large in view), phase reads `InSpace` then flips to `Descending` as you fall toward it. Map shows the ship marker jump next to the Moon. Ctrl-C.

- [ ] **Step 6: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/NavMap.ts src/render/scene/warpEffect.ts src/ui/ui.css src/game/Game.ts
git commit -m "feat: nav map target selection and lightspeed warp to the Moon"
```

---

### Task 11: Target & home markers (projection math tested) + HUD arrows

**Files:**
- Create: `src/game/markers.ts`
- Test: `tests/game/markers.test.ts`
- Modify: `src/ui/HUD.ts`, `src/ui/ui.css`, `src/game/Game.ts`

**Interfaces:**
- Consumes: `THREE.PerspectiveCamera`, `THREE.Vector3`.
- Produces:
  ```ts
  interface MarkerScreen { onScreen: boolean; x: number; y: number; }
  // Projects a render-space world point to normalized screen coords in [0,1].
  // onScreen is true only if the point is in front of the camera AND within [0,1]^2.
  // When behind/off-screen, x/y are clamped to the [0,1] edge in the correct direction
  // so an arrow can point toward it.
  function projectMarker(worldPos: THREE.Vector3, camera: THREE.PerspectiveCamera): MarkerScreen;
  ```

- [ ] **Step 1: Write the failing test `tests/game/markers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { projectMarker } from "../../src/game/markers";

function cam(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(70, 1, 0.1, 1e9);
  c.position.set(0, 0, 0);
  c.lookAt(0, 0, -1); // looking down -Z
  c.updateMatrixWorld(true);
  return c;
}

describe("projectMarker", () => {
  it("puts a point dead ahead near screen center", () => {
    const m = projectMarker(new THREE.Vector3(0, 0, -100), cam());
    expect(m.onScreen).toBe(true);
    expect(m.x).toBeCloseTo(0.5, 1);
    expect(m.y).toBeCloseTo(0.5, 1);
  });

  it("marks a point behind the camera as off-screen", () => {
    const m = projectMarker(new THREE.Vector3(0, 0, 100), cam());
    expect(m.onScreen).toBe(false);
  });

  it("clamps an off-screen point to the [0,1] range", () => {
    const m = projectMarker(new THREE.Vector3(1000, 0, -100), cam());
    expect(m.onScreen).toBe(false);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/markers.test.ts`
Expected: FAIL — cannot find module `markers`.

- [ ] **Step 3: Implement `src/game/markers.ts`**

```ts
import * as THREE from "three";

export interface MarkerScreen {
  onScreen: boolean;
  x: number;
  y: number;
}

export function projectMarker(worldPos: THREE.Vector3, camera: THREE.PerspectiveCamera): MarkerScreen {
  const v = worldPos.clone().project(camera); // NDC: x,y in [-1,1], z<1 in front
  // In THREE, a point in front of the camera has clip w>0; project() returns NDC
  // where points behind produce inverted coords. Detect front via view-space z.
  const viewPos = worldPos.clone().applyMatrix4(camera.matrixWorldInverse);
  const inFront = viewPos.z < 0;
  let x = (v.x + 1) / 2;
  let y = (1 - v.y) / 2; // flip Y for screen space
  const within = inFront && x >= 0 && x <= 1 && y >= 0 && y <= 1;
  if (!within) {
    if (!inFront) {
      // project direction onto screen edges using the view-space angle
      x = viewPos.x < 0 ? 0 : 1;
      y = 0.5;
    }
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
  }
  return { onScreen: within, x, y };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/markers.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add a marker element to the HUD**

In `src/ui/HUD.ts`, add a target-marker API:

```ts
  private marker?: HTMLDivElement;

  setMarker(label: string, x: number, y: number, onScreen: boolean): void {
    if (!this.marker) {
      this.marker = document.createElement("div");
      this.marker.className = "marker";
      this.el.parentElement!.appendChild(this.marker);
    }
    this.marker.style.left = `${x * 100}%`;
    this.marker.style.top = `${y * 100}%`;
    this.marker.textContent = onScreen ? `⊕ ${label}` : `➤ ${label}`;
  }

  hideMarker(): void {
    if (this.marker) this.marker.textContent = "";
  }
```

Add to `src/ui/ui.css`:

```css
#ui .marker { position: absolute; transform: translate(-50%,-50%); color: #6f6;
              font: 13px monospace; text-shadow: 0 0 4px #000; white-space: nowrap; }
```

- [ ] **Step 6: Drive the marker from `src/game/Game.ts`**

Add import: `import { projectMarker } from "./markers";`
In `updateHud()` (or a new `updateMarkers()` called each frame after `updateBodies`), add:

```ts
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
```

(Call this after `this.renderer.camera` has its updated pose for the frame, i.e. after `this.rig.setCockpit(...)`.)

- [ ] **Step 7: Manual verify**

Run: `npm run dev`. Open the map (M), target the Moon, close it.
Expected: a green marker shows the Moon's direction and distance; when the Moon is off-screen the marker sits at the screen edge as an arrow `➤`, and when you point at it the marker is `⊕` over the Moon. Distance counts down as you warp/fly closer. Ctrl-C.

- [ ] **Step 8: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/game/markers.ts tests/game/markers.test.ts src/ui/HUD.ts src/ui/ui.css src/game/Game.ts
git commit -m "feat: target marker with off-screen direction arrow"
```

---

### Task 12: On-foot mode — exit ship, moonwalk, look back, re-enter

**Files:**
- Create: `src/render/scene/astronaut.ts`
- Modify: `src/game/Game.ts`

**Interfaces:**
- Consumes: `createAstronaut`, `stepAstronaut`, `Astronaut` (`src/sim/Astronaut`); `selectPrimaryBody`; `InputManager`; `transition`, `Phase`.
- Produces:
  - `function createAstronaut3D(scene: THREE.Scene): { group: THREE.Group }` — a small capsule avatar.
  - In `Game`: handling of `toggleExit` (F) to switch between `LandedMoon` and `OnFoot`; while `OnFoot`, drive `stepAstronaut` from movement intents projected onto the surface tangent using the camera's facing, and place the camera at the astronaut's eye height.

- [ ] **Step 1: Create `src/render/scene/astronaut.ts`**

```ts
import * as THREE from "three";

export function createAstronaut3D(scene: THREE.Scene): { group: THREE.Group } {
  const group = new THREE.Group();
  const suit = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 }),
  );
  group.add(suit);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.4, roughness: 0.2 }),
  );
  helmet.position.y = 0.9;
  group.add(helmet);
  group.visible = false;
  scene.add(group);
  return { group };
}
```

- [ ] **Step 2: Wire on-foot mode into `src/game/Game.ts`**

Add imports:

```ts
import { Astronaut, createAstronaut, stepAstronaut } from "../sim/Astronaut";
import { createAstronaut3D } from "../render/scene/astronaut";
```

Add fields:

```ts
  private astronaut: Astronaut | null = null;
  private astronautGroup!: THREE.Group;
```

In the constructor: `this.astronautGroup = createAstronaut3D(this.renderer.scene).group;`

In `frame`, handle the exit/enter toggle (edge-triggered):

```ts
    if (this.input.consumePressed("toggleExit")) this.toggleExit();
```

Add:

```ts
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
```

In `stepSim()`, branch on mode: when `OnFoot`, step the astronaut instead of the ship:

```ts
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
```

In `frame`, when on foot, position the camera at the astronaut's eyes and show the avatar a step ahead; otherwise use the cockpit rig. Replace the single `rig.setCockpit(...)` call with:

```ts
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
```

Also reposition the ship group (it should remain visible on the Moon while you walk): keep the existing `this.shipGroup.position.copy(shipVec)` line so the lander stays rendered behind you.

- [ ] **Step 3: Manual verify**

Run: `npm run dev`. Get to the Moon and land (warp to Moon, descend gently). When phase is `LandedMoon`, press **F**.
Expected: you exit into first-person on the surface; **W/A/S/D** walk you in low gravity, **Space** makes a high floaty jump; turning around you can see your lander standing on the surface against the black sky with distant Earth. Press **F** to re-enter. Ctrl-C.

- [ ] **Step 4: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/scene/astronaut.ts src/game/Game.ts
git commit -m "feat: on-foot mode — exit ship, moonwalk in 1/6 g, re-enter"
```

---

### Task 13: Mouse look, down-view toggle, and landing dust (polish)

**Files:**
- Create: `src/render/scene/dust.ts`
- Modify: `src/render/CameraRig.ts`, `src/game/Game.ts`

**Interfaces:**
- Consumes: `THREE`, pointer-lock API, `toggleCamera` intent, `createDust`.
- Produces:
  - `function createDust(scene: THREE.Scene): { puff(at: THREE.Vector3): void; update(dt: number): void }` — a short particle puff on touchdown.
  - Mouse-look: on canvas click, request pointer lock; accumulate mouse deltas into a look offset applied to the cockpit/astronaut camera. Bind `toggleCamera` (C) to `CameraRig.toggleDownView()`.

- [ ] **Step 1: Create `src/render/scene/dust.ts`**

```ts
import * as THREE from "three";

export function createDust(scene: THREE.Scene): { puff(at: THREE.Vector3): void; update(dt: number): void } {
  const count = 80;
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xccccbb, size: 0.5, transparent: true, opacity: 0 });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let life = 0;
  return {
    puff(at: THREE.Vector3): void {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        positions[i * 3] = at.x + Math.cos(a) * 2;
        positions[i * 3 + 1] = at.y;
        positions[i * 3 + 2] = at.z + Math.sin(a) * 2;
      }
      geo.attributes.position.needsUpdate = true;
      life = 1.5;
      mat.opacity = 0.8;
    },
    update(dt: number): void {
      if (life > 0) {
        life = Math.max(0, life - dt);
        mat.opacity = (life / 1.5) * 0.8;
      }
    },
  };
}
```

- [ ] **Step 2: Add mouse-look + down-view to `src/render/CameraRig.ts`**

Extend the rig with a yaw/pitch look offset applied on top of the cockpit orientation:

```ts
  private lookYaw = 0;
  private lookPitch = 0;

  addLook(dx: number, dy: number): void {
    this.lookYaw -= dx * 0.0022;
    this.lookPitch -= dy * 0.0022;
    this.lookPitch = Math.max(-1.2, Math.min(1.2, this.lookPitch));
  }
```

In `setCockpit`, after copying the ship pose and applying the down-view tilt, apply the look offset:

```ts
    this.camera.rotateY(this.lookYaw);
    this.camera.rotateX(this.lookPitch);
```

- [ ] **Step 3: Wire pointer lock + camera toggle in `src/game/Game.ts`**

Add imports: `import { createDust } from "../render/scene/dust";`
Add field: `private dust!: { puff(at: THREE.Vector3): void; update(dt: number): void };`
In the constructor:

```ts
    this.dust = createDust(this.renderer.scene);
    const canvasEl = this.renderer.camera ? document.getElementById("view")! : document.body;
    canvasEl.addEventListener("click", () => canvasEl.requestPointerLock());
    window.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement) this.rig.addLook(e.movementX, e.movementY);
    });
```

In `frame`, handle the camera toggle and update dust:

```ts
    if (this.input.consumePressed("toggleCamera")) this.rig.toggleDownView();
    this.dust.update(dt);
```

Trigger a dust puff on Moon touchdown — in the `Descending`→`LandedMoon` branch in `stepSim()` (Task 9), after `snapToSurface(...)`:

```ts
        const r = toRender(this.fo, this.ship.position);
        this.dust.puff(new THREE.Vector3(r.x, r.y, r.z));
```

- [ ] **Step 4: Manual verify**

Run: `npm run dev`. Click the view to capture the mouse.
Expected: moving the mouse looks around the cockpit; **C** toggles a straight-down landing view (useful on final descent); landing on the Moon kicks up a brief dust puff. Esc releases the mouse. Ctrl-C.

- [ ] **Step 5: Verify suite green**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/render/scene/dust.ts src/render/CameraRig.ts src/game/Game.ts
git commit -m "feat: mouse-look, down-view toggle, and landing dust puff"
```

---

### Task 14: Full-loop playtest pass + tuning

**Files:**
- Modify: `src/sim/Spacecraft.ts` (tuning values only, if needed), `src/sim/constants.ts` (`DISTANCE_SCALE` only, if needed), `src/game/*` thresholds (if needed)

**Interfaces:**
- Consumes: everything. Produces: no new API — this task tunes constants to hit the design's feel targets and confirms the end-to-end arc.

- [ ] **Step 1: Run the full arc and note timings**

Run: `npm run dev`. Play the complete loop: launch off Earth → reach space → open map, target Moon, warp (or fly manually) → descend → land → exit → walk → look back.
Record: time for a manual Earth→Moon flight, warp time, whether launch feels too easy/hard, whether descent is controllable.

- [ ] **Step 2: Tune to targets**

Adjust only constants to hit the design targets (manual Earth→Moon ≈ 2–5 min; warp < 10 s; controllable descent; safe touchdown achievable):
- If manual transit is too slow/fast: adjust `DISTANCE_SCALE` in `src/sim/constants.ts` and/or `maxThrust`/`fuelMass` in `createSpacecraft`.
- If launch is impossible/trivial: adjust `maxThrust`.
- If descent is twitchy: adjust `THROTTLE_RATE` (`src/game/shipControl.ts`) or `ROT_RATE` (`src/game/attitude.ts`).
Re-run after each change. Keep edits to named constants — do not change formulas.

- [ ] **Step 3: Confirm carry-over feel items**

Verify the spec-mandated astronaut behavior (airborne horizontal velocity resets each step / air-strafe) feels acceptable on the Moon walk. If it feels bad, note it for a future slice — do NOT change `src/sim/Astronaut.ts` here (out of scope; that's a sim-layer change with its own test cycle).

- [ ] **Step 4: Verify the whole suite is green and tsc is clean**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass; no type errors.

- [ ] **Step 5: Commit any tuning changes**

```bash
git add -A
git commit -m "chore: tune flight/warp/descent constants to design feel targets"
```

(If no tuning was needed, skip the commit and note that the defaults already hit the targets.)

---

## Self-Review

**Spec coverage (against the Slice 1 design doc):**
- First-person cockpit primary view → Tasks 5, 13 (CameraRig) ✓
- Launch vertically off Earth against real gravity → Tasks 5–7 ✓
- Nav map + select target → Task 10 ✓
- Lightspeed warp (auto-orient, drop at safe approach) → Task 10 (uses Plan A `warpTo`) ✓
- Manual flight option (2–5 min) → Tasks 6, 14 (tuning) ✓
- Descend through to airless Moon landing → Tasks 7, 9, 13 ✓
- Target/home direction markers so you never get lost → Task 11 ✓
- HUD (altitude, speed, vertical speed, fuel, throttle, warnings) → Task 8 ✓
- Cockpit instruments / attitude → Tasks 4 (attitude), 8 (HUD readouts incl. V/S); attitude indicator value surfaced via V/S + tilt warning ✓
- Land on Moon, step out, moonwalk in 1/6 g, look back at lander → Task 12 ✓
- Soft crash → reset (no penalty) → Task 9 ✓
- Down-view/landing camera, dust → Task 13 ✓
- Stylized-realism art, performant browser → simple PBR meshes + log depth buffer throughout ✓
- Keyboard + mouse controls → input wired Tasks 6, 13 (mouse-look) ✓
- Floating origin for huge distances → used every frame (Tasks 2, 5) ✓
- Primary-body selector (Plan A carry-over) → Task 3 ✓
- `shipAccelFn` rebuilt each step (carry-over) → Task 5 stepSim ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" left; every code step contains complete code. The few "(if needed)"/"(temporary)" notes are explicit, scoped instructions (tuning, preview wiring replaced in Task 5), not deferrals of implementation.

**Type consistency:** `selectPrimaryBody`→`PrimaryBody{body,altitude,up}` used consistently; `thrustDirection`/`rotateAttitude` quaternion↔`Vec3` conversions consistent; `nextPhase`/`PhaseContext`, `evaluateTouchdown`/`Touchdown`, `projectMarker`/`MarkerScreen`, `HudState` fields match across producer and consumer tasks. Sim API names (`toMotionState`, `applyMotionState`, `shipAccelFn`, `warpTo`, `safeApproachDistance`, `createAstronaut`, `stepAstronaut`, `burnFuel`, `surfaceGravity`) match the merged Plan A exports.

**Known soft spots to watch in review (called out, not hidden):** the off-screen marker clamp in `projectMarker` is a simplified edge-projection (full edge-intersection math is a later polish); the warp effect is a flash placeholder, not a streak shader; cockpit "instruments" are surfaced through the HUD readouts rather than a separate 3D gauge model. All are intentional Slice-1 scope choices consistent with "stylized realism, ship soon."

---

## Execution Handoff

Plan complete. After implementation, the slice is fully playable end-to-end. The natural follow-on slices (Mars/atmospheric entry, procedural terrain, lifeforms, third-person camera, gamepad) each get their own spec → plan → implementation cycle.
