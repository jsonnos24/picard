# The Juice Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the realistic Earth→Moon sim into an arcade-sim thrill ride — momentum handling, punchier thrust, a speed-reactive camera, streaking motion field, skim intensity, and a cinematic warp leap.

**Architecture:** All "feel-math" is pure and unit-tested, living in a new `src/game/feel/` directory that mirrors the existing 64-test sim core. The Three.js consumers (`CameraRig`, `speedDust`, `warpEffect`, `Game`) read that math and are verified by build + manual playtest. No physics in the sim core changes except one tuning constant (thrust).

**Tech Stack:** TypeScript (strict), Three.js r169, Vite, Vitest. Spec: `docs/superpowers/specs/2026-06-21-juice-pass-design.md`.

## Global Constraints

- No new runtime dependencies. Audio is explicitly deferred.
- Pure feel-math lives in `src/game/feel/`; it must not import Three.js scene/render objects (importing `three` for `Quaternion`/`Vector3` math is fine, matching `attitude.ts`).
- Every code change keeps `npm run build` (`tsc --noEmit && vite build`) clean and `npm test` green.
- Sim physics runs at `FIXED_DT = 1/60`. Feel-math that runs per render-frame (camera shake, FOV, warp sequence) takes the real frame `dt` and must tolerate variable dt.
- Test style mirrors `tests/game/attitude.test.ts`: `import { describe, it, expect } from "vitest"`, a local `fakeInput(active: Intent[])` helper where input is needed.
- Commit after each task with the `feat:`/`refactor:`/`tune:` prefix shown.

---

### Task 1: Momentum turning (arcade handling)

Replace instant-on rotation (`attitude.ts` applies `ROT_RATE * dt` directly per input) with an angular-velocity model that ramps up and eases out, so turns feel swoopy and the craft has mass.

**Files:**
- Create: `src/game/feel/turning.ts`
- Create: `tests/game/feel/turning.test.ts`
- Modify: `src/game/Game.ts` (replace the `rotateAttitude` call site; add angular state)

**Interfaces:**
- Consumes: `Intent` from `src/sim/input/bindings`; `ControlInput`-style `{ isActive(i: Intent): boolean }`.
- Produces:
  - `interface AngularState { pitch: number; yaw: number; roll: number }` (rad/s)
  - `function zeroAngular(): AngularState`
  - `function stepTurning(q: THREE.Quaternion, state: AngularState, im: { isActive(i: Intent): boolean }, dt: number): { quat: THREE.Quaternion; state: AngularState }`
  - constants `MAX_RATE`, `RATE_ACCEL`, `RATE_DAMP`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/game/feel/turning.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Intent } from "../../../src/sim/input/bindings";
import { stepTurning, zeroAngular, MAX_RATE } from "../../../src/game/feel/turning";

function fakeInput(active: Intent[]) {
  return { isActive: (i: Intent) => active.includes(i) };
}

describe("turning (momentum)", () => {
  it("ramps up gradually — one short step is far below max rate", () => {
    const { state } = stepTurning(new THREE.Quaternion(), zeroAngular(), fakeInput(["pitchUp"]), 1 / 60);
    expect(state.pitch).toBeGreaterThan(0);
    expect(state.pitch).toBeLessThan(MAX_RATE * 0.5);
  });

  it("approaches MAX_RATE when held over time", () => {
    let s = zeroAngular();
    let q = new THREE.Quaternion();
    for (let i = 0; i < 600; i++) ({ quat: q, state: s } = stepTurning(q, s, fakeInput(["pitchUp"]), 1 / 60));
    expect(s.pitch).toBeCloseTo(MAX_RATE, 1);
  });

  it("eases out after release — rate decays toward zero, not instant stop", () => {
    let s = { pitch: MAX_RATE, yaw: 0, roll: 0 };
    let q = new THREE.Quaternion();
    ({ quat: q, state: s } = stepTurning(q, s, fakeInput([]), 1 / 60));
    expect(s.pitch).toBeGreaterThan(0);          // still coasting
    expect(s.pitch).toBeLessThan(MAX_RATE);      // but decaying
  });

  it("rotates the quaternion while a rate is non-zero", () => {
    const s = { pitch: MAX_RATE, yaw: 0, roll: 0 };
    const { quat } = stepTurning(new THREE.Quaternion(), s, fakeInput([]), 1 / 60);
    expect(quat.angleTo(new THREE.Quaternion())).toBeGreaterThan(0);
  });

  it("does not mutate the input quaternion or state", () => {
    const q0 = new THREE.Quaternion();
    const s0 = zeroAngular();
    stepTurning(q0, s0, fakeInput(["yawLeft"]), 1 / 60);
    expect(q0.equals(new THREE.Quaternion())).toBe(true);
    expect(s0.yaw).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/feel/turning.test.ts`
Expected: FAIL — `Cannot find module '.../src/game/feel/turning'`.

- [ ] **Step 3: Implement `turning.ts`**

```ts
// src/game/feel/turning.ts
import * as THREE from "three";
import { Intent } from "../../sim/input/bindings";

export interface AngularState { pitch: number; yaw: number; roll: number } // rad/s

export const MAX_RATE = 0.9;   // rad/s at full deflection (was a flat ROT_RATE=0.6)
export const RATE_ACCEL = 3.0; // rad/s^2 ramp toward the commanded rate
export const RATE_DAMP = 2.5;  // 1/s exponential-ish decay when no input on that axis

interface TurnInput { isActive(i: Intent): boolean }

export function zeroAngular(): AngularState {
  return { pitch: 0, yaw: 0, roll: 0 };
}

// Move a single axis rate toward its command: accelerate when commanded, damp toward 0 when not.
function stepAxis(rate: number, command: number, dt: number): number {
  if (command !== 0) {
    const target = command * MAX_RATE;
    const delta = target - rate;
    const step = RATE_ACCEL * dt;
    return Math.abs(delta) <= step ? target : rate + Math.sign(delta) * step;
  }
  // No input: decay toward zero.
  const decay = Math.exp(-RATE_DAMP * dt);
  const next = rate * decay;
  return Math.abs(next) < 1e-4 ? 0 : next;
}

export function stepTurning(
  q: THREE.Quaternion,
  state: AngularState,
  im: TurnInput,
  dt: number,
): { quat: THREE.Quaternion; state: AngularState } {
  const cmdPitch = (im.isActive("pitchUp") ? 1 : 0) + (im.isActive("pitchDown") ? -1 : 0);
  const cmdYaw = (im.isActive("yawLeft") ? 1 : 0) + (im.isActive("yawRight") ? -1 : 0);
  const cmdRoll = (im.isActive("rollLeft") ? 1 : 0) + (im.isActive("rollRight") ? -1 : 0);

  const next: AngularState = {
    pitch: stepAxis(state.pitch, cmdPitch, dt),
    yaw: stepAxis(state.yaw, cmdYaw, dt),
    roll: stepAxis(state.roll, cmdRoll, dt),
  };

  // Apply body-relative rotations (same axis convention as attitude.ts:
  // X = pitch, Z = yaw, Y = roll/thrust axis).
  const quat = q.clone();
  if (next.pitch !== 0) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), next.pitch * dt));
  if (next.yaw !== 0) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), next.yaw * dt));
  if (next.roll !== 0) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), next.roll * dt));
  return { quat: quat.normalize(), state: next };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/feel/turning.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire into `Game.ts`**

Add the import and a field, then replace the attitude call. In `src/game/Game.ts`:

Add to imports (near line 26):
```ts
import { AngularState, zeroAngular, stepTurning } from "./feel/turning";
```
Add a field (near line 48, by `private quat`):
```ts
private angular: AngularState = zeroAngular();
```
Replace the manual-control branch inside `stepSim` (currently lines 125-130, the `else` block):
```ts
    } else {
      // Momentum turning: rates ramp up and ease out for a swoopy, alive feel.
      const turn = stepTurning(this.quat, this.angular, this.input, dt);
      this.quat = turn.quat;
      this.angular = turn.state;
      this.ship.throttle = nextThrottle(this.ship.throttle, this.input, dt);
      this.ship.orientation = thrustDirection(this.quat);
    }
```
`thrustDirection` is still imported from `./attitude`; leave that import. (The old `rotateAttitude` import becomes unused — remove it from the import on line 26 to keep `tsc` clean: change `import { rotateAttitude, thrustDirection } from "./attitude";` to `import { thrustDirection } from "./attitude";`.)

- [ ] **Step 6: Build and test**

Run: `npm run build && npm test`
Expected: build clean, all tests green (existing `attitude.test.ts` still passes — `attitude.ts` is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/game/feel/turning.ts tests/game/feel/turning.test.ts src/game/Game.ts
git commit -m "feat: momentum turning for swoopy arcade handling"
```

---

### Task 2: Punchier thrust (tuning)

Bump thrust authority so speed builds excitingly toward a ~60–90s hand-flown cruise. Pure constant change; the existing physics tests must still pass.

**Files:**
- Modify: `src/sim/Spacecraft.ts:23` (the `maxThrust` value)
- Check: `tests/sim/Spacecraft.test.ts` (only if it asserts a thrust magnitude)

**Interfaces:**
- Consumes/Produces: nothing new — same `Spacecraft` shape.

- [ ] **Step 1: Check whether any test pins the thrust value**

Run: `grep -n "1.2e6\|maxThrust" tests/sim/Spacecraft.test.ts`
Expected: note any test that hard-codes `1.2e6`. If a test asserts `thrustAccel` magnitude from the default craft, it will need its expected value updated in Step 3.

- [ ] **Step 2: Raise `maxThrust`**

In `src/sim/Spacecraft.ts`, change line 23:
```ts
    maxThrust: 1.2e6, // N — strong enough to launch off Earth
```
to:
```ts
    maxThrust: 2.2e6, // N — punchy launch + arcade-sim acceleration (playtest-tunable)
```

- [ ] **Step 3: Update any thrust-magnitude assertion**

If Step 1 found a test pinning `1.2e6`-derived acceleration, recompute: `thrustAccel = throttle * maxThrust / (dryMass + fuelMass)`. At full throttle that is `2.2e6 / 35000 ≈ 62.86 m/s²`. Update the expected value. If no such test exists, skip.

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: build clean, all green.

- [ ] **Step 5: Playtest the feel (manual)**

Run: `npm run dev`, launch from Earth, throttle up. Confirm noticeably punchier acceleration. This value is a tunable — adjust `maxThrust` between ~1.8e6 and ~2.6e6 to taste (target: hand-flown Earth→Moon ~60–90s). Note the chosen value in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/sim/Spacecraft.ts tests/sim/Spacecraft.test.ts
git commit -m "tune: punchier thrust for arcade-sim acceleration"
```

---

### Task 3: Speed → FOV

Widen field-of-view with velocity so speed becomes visceral. Pure mapping + `CameraRig` application.

**Files:**
- Create: `src/game/feel/fov.ts`
- Create: `tests/game/feel/fov.test.ts`
- Modify: `src/render/CameraRig.ts` (apply FOV in `setCockpit`)
- Modify: `src/game/Game.ts` (pass speed to the rig)

**Interfaces:**
- Produces: `function fovForSpeed(speed: number): number`; constants `FOV_BASE = 70`, `FOV_MAX = 95`, `FOV_SPEED_REF`.
- `CameraRig.setCockpit` gains a third parameter: `setCockpit(shipRenderPos: THREE.Vector3, shipQuat: THREE.Quaternion, speed: number): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/game/feel/fov.test.ts
import { describe, it, expect } from "vitest";
import { fovForSpeed, FOV_BASE, FOV_MAX } from "../../../src/game/feel/fov";

describe("fovForSpeed", () => {
  it("is the base FOV at rest", () => {
    expect(fovForSpeed(0)).toBeCloseTo(FOV_BASE, 6);
  });

  it("widens monotonically with speed", () => {
    expect(fovForSpeed(2000)).toBeGreaterThan(fovForSpeed(500));
    expect(fovForSpeed(500)).toBeGreaterThan(fovForSpeed(0));
  });

  it("never exceeds FOV_MAX", () => {
    expect(fovForSpeed(1e9)).toBeLessThanOrEqual(FOV_MAX);
    expect(fovForSpeed(1e9)).toBeGreaterThan(FOV_MAX - 1); // asymptotes close to max
  });

  it("is finite and base for tiny speeds", () => {
    expect(fovForSpeed(1)).toBeCloseTo(FOV_BASE, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/feel/fov.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fov.ts`**

```ts
// src/game/feel/fov.ts
export const FOV_BASE = 70;       // deg — matches Renderer's PerspectiveCamera default
export const FOV_MAX = 95;        // deg — widest "barely contained" framing
export const FOV_SPEED_REF = 6000; // m/s — speed scale over which FOV approaches max

// Eased saturating curve: base at rest, asymptotically approaching FOV_MAX.
export function fovForSpeed(speed: number): number {
  const s = Math.max(0, speed);
  const k = 1 - Math.exp(-s / FOV_SPEED_REF);
  return FOV_BASE + (FOV_MAX - FOV_BASE) * k;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/feel/fov.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Apply FOV in `CameraRig`**

In `src/render/CameraRig.ts`, add the import at the top:
```ts
import { fovForSpeed } from "../game/feel/fov";
```
Change the `setCockpit` signature and body to set the camera FOV (smoothed toward the target so it breathes rather than snaps). Replace the method:
```ts
  setCockpit(shipRenderPos: THREE.Vector3, shipQuat: THREE.Quaternion, speed: number): void {
    this.camera.position.copy(shipRenderPos);
    this.camera.quaternion.copy(shipQuat);
    const tilt = this.downView ? -Math.PI / 2 : Math.PI / 2;
    this.camera.rotateX(tilt);
    this.camera.rotateY(this.lookYaw);
    this.camera.rotateX(this.lookPitch);

    // Speed-reactive FOV, eased toward the target so it breathes.
    const targetFov = fovForSpeed(speed);
    this.currentFov += (targetFov - this.currentFov) * 0.08;
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }
```
Add the smoothing field near the other private fields (around line 5):
```ts
  private currentFov = 70;
```

- [ ] **Step 6: Pass speed from `Game.ts`**

In `src/game/Game.ts`, find the `else` branch of the cockpit/on-foot block (currently line 280) and pass the ship speed:
```ts
      this.rig.setCockpit(shipVec, this.quat, this.ship.velocity.length());
```

- [ ] **Step 7: Build and playtest**

Run: `npm run build && npm test` (expected clean/green), then `npm run dev`. Accelerate and confirm the view widens with speed and eases back when slowing.

- [ ] **Step 8: Commit**

```bash
git add src/game/feel/fov.ts tests/game/feel/fov.test.ts src/render/CameraRig.ts src/game/Game.ts
git commit -m "feat: speed-reactive FOV for visceral velocity"
```

---

### Task 4: Camera shake & g-lean

Add a subtle acceleration rattle (grows with speed and thrust) and a small g-lean (cockpit leans opposite the turn, driven by Task 1's angular rates), so the craft feels physical.

**Files:**
- Create: `src/game/feel/shake.ts`
- Create: `tests/game/feel/shake.test.ts`
- Modify: `src/render/CameraRig.ts` (apply offsets after orientation)
- Modify: `src/game/Game.ts` (pass accel magnitude, angular state, and a time value)

**Interfaces:**
- Consumes: `AngularState` from `./turning`.
- Produces:
  - `interface Offset { x: number; y: number; z: number }`
  - `function shakeOffset(speed: number, accelMag: number, t: number): Offset` (camera-local metres)
  - `function gLeanOffset(state: AngularState): Offset` (camera-local metres)
  - constants `SHAKE_MAX`, `LEAN_MAX`
- `CameraRig.setCockpit` gains parameters: `setCockpit(pos, quat, speed, accelMag, angular, t)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/game/feel/shake.test.ts
import { describe, it, expect } from "vitest";
import { shakeOffset, gLeanOffset, SHAKE_MAX, LEAN_MAX } from "../../../src/game/feel/shake";
import { zeroAngular } from "../../../src/game/feel/turning";

describe("shakeOffset", () => {
  it("is zero at rest with no acceleration", () => {
    const o = shakeOffset(0, 0, 1.23);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(0, 6);
    expect(o.z).toBeCloseTo(0, 6);
  });

  it("grows with speed and acceleration but stays bounded by SHAKE_MAX", () => {
    let maxComponent = 0;
    for (let i = 0; i < 200; i++) {
      const o = shakeOffset(9000, 60, i * 0.05);
      maxComponent = Math.max(maxComponent, Math.abs(o.x), Math.abs(o.y), Math.abs(o.z));
    }
    expect(maxComponent).toBeGreaterThan(0);
    expect(maxComponent).toBeLessThanOrEqual(SHAKE_MAX + 1e-9);
  });

  it("varies over time (oscillates, not constant)", () => {
    const a = shakeOffset(9000, 60, 0.1);
    const b = shakeOffset(9000, 60, 0.2);
    expect(a.x).not.toBeCloseTo(b.x, 6);
  });
});

describe("gLeanOffset", () => {
  it("is zero when not turning", () => {
    const o = gLeanOffset(zeroAngular());
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(0, 6);
  });

  it("leans opposite a yaw and is bounded by LEAN_MAX", () => {
    const o = gLeanOffset({ pitch: 0, yaw: 1.0, roll: 0 });
    expect(Math.abs(o.x)).toBeGreaterThan(0);
    expect(Math.abs(o.x)).toBeLessThanOrEqual(LEAN_MAX + 1e-9);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/feel/shake.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `shake.ts`**

```ts
// src/game/feel/shake.ts
import { AngularState } from "./turning";

export interface Offset { x: number; y: number; z: number }

export const SHAKE_MAX = 0.18; // metres — peak camera judder
export const LEAN_MAX = 0.25;  // metres — peak g-lean translation

const SPEED_REF = 9000; // m/s where speed's shake contribution saturates
const ACCEL_REF = 60;   // m/s^2 where thrust's shake contribution saturates

// Bounded, time-varying judder. Amplitude blends a speed term and an acceleration term.
export function shakeOffset(speed: number, accelMag: number, t: number): Offset {
  const speedTerm = 1 - Math.exp(-Math.max(0, speed) / SPEED_REF);
  const accelTerm = 1 - Math.exp(-Math.max(0, accelMag) / ACCEL_REF);
  const amp = SHAKE_MAX * Math.min(1, 0.5 * speedTerm + 0.7 * accelTerm);
  // Layered sines at incommensurate frequencies → pseudo-random but deterministic.
  return {
    x: amp * (Math.sin(t * 37.0) * 0.6 + Math.sin(t * 53.3) * 0.4),
    y: amp * (Math.sin(t * 41.7) * 0.6 + Math.sin(t * 61.1) * 0.4),
    z: amp * (Math.sin(t * 47.9) * 0.5),
  };
}

// Cockpit leans opposite the turn so rotation reads as g-force, not a free pivot.
export function gLeanOffset(state: AngularState): Offset {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    x: clamp(-state.yaw) * LEAN_MAX,   // yaw left → lean right
    y: clamp(-state.pitch) * LEAN_MAX, // pitch up → lean back/down
    z: 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/feel/shake.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Apply offsets in `CameraRig`**

In `src/render/CameraRig.ts`, extend imports:
```ts
import { fovForSpeed } from "../game/feel/fov";
import { shakeOffset, gLeanOffset } from "../game/feel/shake";
import { AngularState } from "../game/feel/turning";
```
Change `setCockpit` to take the new params and translate the camera in its local frame **after** orientation is set (so offsets are relative to the cockpit), before the FOV block:
```ts
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
```

- [ ] **Step 6: Feed the values from `Game.ts`**

In `src/game/Game.ts`, the frame `dt`/`t` are available in `frame(t)`. Store the current thrust acceleration magnitude where the sim computes it. Add a field near line 64:
```ts
  private lastAccelMag = 0;
```
In `stepSim`, right after `const accel = shipAccelFn(this.ship, this.bodies);` (line 132), record the thrust contribution:
```ts
    this.lastAccelMag = shipThrustAccel(this.ship).length();
```
(`shipThrustAccel` is already imported as `thrustAccel as shipThrustAccel`.) Then update the cockpit call (the `else` branch near line 280) to:
```ts
      this.rig.setCockpit(
        shipVec,
        this.quat,
        this.ship.velocity.length(),
        this.lastAccelMag,
        this.angular,
        t / 1000,
      );
```
`t` is the `frame(t)` parameter (milliseconds); `t / 1000` gives seconds for the shake oscillators.

- [ ] **Step 7: Build and playtest**

Run: `npm run build && npm test` (clean/green), then `npm run dev`. Confirm a subtle rattle under thrust/high speed and a slight lean when turning. Tune `SHAKE_MAX` / `LEAN_MAX` to taste — should be felt, not nauseating.

- [ ] **Step 8: Commit**

```bash
git add src/game/feel/shake.ts tests/game/feel/shake.test.ts src/render/CameraRig.ts src/game/Game.ts
git commit -m "feat: acceleration shake and g-lean for a craft with mass"
```

---

### Task 5: Streaking motion field

Push `speedDust` from faint points to brightening, lengthening streaks at high speed so the galaxy genuinely rushes by.

**Files:**
- Create: `src/game/feel/streak.ts`
- Create: `tests/game/feel/streak.test.ts`
- Modify: `src/render/scene/speedDust.ts` (use streak params; render as stretched segments)

**Interfaces:**
- Produces:
  - `interface StreakParams { opacity: number; size: number; length: number }`
  - `function streakParams(speed: number, boost: number): StreakParams` — `boost` (0..1) raises intensity (used later by skim, Task 6); pass `0` for now.
  - constants `STREAK_OPACITY_MAX`, `STREAK_SIZE_MAX`, `STREAK_LENGTH_MAX`, `STREAK_SPEED_REF`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/game/feel/streak.test.ts
import { describe, it, expect } from "vitest";
import {
  streakParams,
  STREAK_OPACITY_MAX,
  STREAK_LENGTH_MAX,
} from "../../../src/game/feel/streak";

describe("streakParams", () => {
  it("is invisible at rest", () => {
    expect(streakParams(0, 0).opacity).toBeCloseTo(0, 6);
    expect(streakParams(0, 0).length).toBeCloseTo(0, 6);
  });

  it("opacity and length rise with speed, bounded by their maxima", () => {
    expect(streakParams(2000, 0).opacity).toBeGreaterThan(streakParams(200, 0).opacity);
    expect(streakParams(1e9, 0).opacity).toBeLessThanOrEqual(STREAK_OPACITY_MAX + 1e-9);
    expect(streakParams(1e9, 0).length).toBeLessThanOrEqual(STREAK_LENGTH_MAX + 1e-9);
  });

  it("boost increases intensity at a given speed but stays bounded", () => {
    const plain = streakParams(1500, 0);
    const boosted = streakParams(1500, 1);
    expect(boosted.opacity).toBeGreaterThan(plain.opacity);
    expect(boosted.opacity).toBeLessThanOrEqual(STREAK_OPACITY_MAX + 1e-9);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/feel/streak.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `streak.ts`**

```ts
// src/game/feel/streak.ts
export interface StreakParams { opacity: number; size: number; length: number }

export const STREAK_OPACITY_MAX = 0.85;
export const STREAK_SIZE_MAX = 3.5;     // point size multiplier ceiling
export const STREAK_LENGTH_MAX = 60;    // metres a particle stretches along velocity
export const STREAK_SPEED_REF = 2500;   // m/s where streaking saturates

export function streakParams(speed: number, boost: number): StreakParams {
  const b = Math.max(0, Math.min(1, boost));
  const k = Math.min(1, (1 - Math.exp(-Math.max(0, speed) / STREAK_SPEED_REF)) * (1 + 0.5 * b));
  const kk = Math.min(1, k);
  return {
    opacity: STREAK_OPACITY_MAX * kk,
    size: 1 + (STREAK_SIZE_MAX - 1) * kk,
    length: STREAK_LENGTH_MAX * kk,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/feel/streak.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Render streaks in `speedDust.ts`**

Convert the point field to line segments that stretch from each particle's base position back along `-velocity` by `length`. Replace the body of `createSpeedDust` in `src/render/scene/speedDust.ts`:

```ts
import * as THREE from "three";
import { Vec3 } from "../../sim/Vec3";
import { streakParams } from "../../game/feel/streak";

const COUNT = 500;
const HALF = 1200; // metres: half-extent of the cube around the camera

function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function wrap(v: number): number {
  return v - 2 * HALF * Math.floor((v + HALF) / (2 * HALF));
}

export function createSpeedDust(scene: THREE.Scene): {
  update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3, boost?: number): void;
} {
  // Two endpoints per particle: [head, tail]. Head holds the base position; tail
  // is recomputed each frame as head - velDir * length.
  const base = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    base[i * 3] = rnd(i + 1) * 2 * HALF - HALF;
    base[i * 3 + 1] = rnd(i + 101) * 2 * HALF - HALF;
    base[i * 3 + 2] = rnd(i + 201) * 2 * HALF - HALF;
  }
  const verts = new Float32Array(COUNT * 6); // 2 points * 3 coords
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xaac4ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);

  return {
    update(velocity: Vec3, dt: number, cameraPos: THREE.Vector3, boost = 0): void {
      const speed = velocity.length();
      const p = streakParams(speed, boost);
      mat.opacity = p.opacity;
      lines.position.copy(cameraPos);

      if (speed > 0.01 && p.opacity > 0) {
        const inv = 1 / speed;
        const dirx = velocity.x * inv, diry = velocity.y * inv, dirz = velocity.z * inv;
        const dx = velocity.x * dt, dy = velocity.y * dt, dz = velocity.z * dt;
        const L = p.length;
        for (let i = 0; i < COUNT; i++) {
          // Advance the base position opposite to velocity (parallax), wrapped.
          base[i * 3] = wrap(base[i * 3] - dx);
          base[i * 3 + 1] = wrap(base[i * 3 + 1] - dy);
          base[i * 3 + 2] = wrap(base[i * 3 + 2] - dz);
          const hx = base[i * 3], hy = base[i * 3 + 1], hz = base[i * 3 + 2];
          const o = i * 6;
          verts[o] = hx; verts[o + 1] = hy; verts[o + 2] = hz;             // head
          verts[o + 3] = hx - dirx * L; verts[o + 4] = hy - diry * L; verts[o + 5] = hz - dirz * L; // tail
        }
        geo.attributes.position.needsUpdate = true;
      }
    },
  };
}
```

The call site in `Game.ts` (`this.speedDust.update(focusVel, dt, this.renderer.camera.position)`, line 286) still works — `boost` defaults to 0. Task 6 will pass a real boost.

- [ ] **Step 6: Build and playtest**

Run: `npm run build && npm test` (clean/green), then `npm run dev`. Confirm particles stretch into streaks and brighten as you accelerate, invisible at rest. Tune the `STREAK_*` constants to taste.

- [ ] **Step 7: Commit**

```bash
git add src/game/feel/streak.ts tests/game/feel/streak.test.ts src/render/scene/speedDust.ts
git commit -m "feat: streaking motion field so the galaxy rushes by"
```

---

### Task 6: Skim intensity

When low over a surface *and* fast, intensify the rush (streak boost now; the warp tunnel reuses the same idea later). Pure intensity + wire as the `boost` into `speedDust`.

**Files:**
- Create: `src/game/feel/skim.ts`
- Create: `tests/game/feel/skim.test.ts`
- Modify: `src/game/Game.ts` (compute skim, pass as `boost`)

**Interfaces:**
- Produces: `function skimIntensity(altitude: number, speed: number): number` → 0..1; constants `SKIM_ALT`, `SKIM_SPEED`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/game/feel/skim.test.ts
import { describe, it, expect } from "vitest";
import { skimIntensity, SKIM_ALT } from "../../../src/game/feel/skim";

describe("skimIntensity", () => {
  it("is zero when high above the surface", () => {
    expect(skimIntensity(SKIM_ALT * 5, 5000)).toBeCloseTo(0, 6);
  });

  it("is zero when slow even if low", () => {
    expect(skimIntensity(10, 0)).toBeCloseTo(0, 6);
  });

  it("is high when low and fast", () => {
    expect(skimIntensity(20, 5000)).toBeGreaterThan(0.5);
  });

  it("stays within [0,1]", () => {
    const v = skimIntensity(0, 1e9);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("increases as altitude drops at fixed speed", () => {
    expect(skimIntensity(50, 4000)).toBeGreaterThan(skimIntensity(400, 4000));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/feel/skim.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `skim.ts`**

```ts
// src/game/feel/skim.ts
export const SKIM_ALT = 1500;   // metres — below this, skim proximity ramps in
export const SKIM_SPEED = 300;  // m/s — above this, skim speed factor ramps in

// Product of a proximity factor (low altitude → 1) and a speed factor (fast → 1).
export function skimIntensity(altitude: number, speed: number): number {
  const prox = Math.max(0, Math.min(1, 1 - Math.max(0, altitude) / SKIM_ALT));
  const fast = Math.max(0, Math.min(1, (Math.max(0, speed) - SKIM_SPEED) / (SKIM_SPEED * 4)));
  return Math.max(0, Math.min(1, prox * fast));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/feel/skim.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire skim into `Game.ts`**

Add the import (near line 25):
```ts
import { skimIntensity } from "./feel/skim";
```
At the `speedDust.update` call (line 286), compute skim from the focus body's altitude and speed and pass it as the boost. Replace that line with:
```ts
      const focusPb = selectPrimaryBody(focusPos, this.bodies);
      const skim = skimIntensity(focusPb.altitude, focusVel.length());
      this.speedDust.update(focusVel, dt, this.renderer.camera.position, skim);
```
(`focusPos`, `focusVel`, and `selectPrimaryBody` are already in scope in `frame`.)

- [ ] **Step 6: Build and playtest**

Run: `npm run build && npm test` (clean/green), then `npm run dev`. Warp to the Moon, descend, and fly fast and low — the streak field should intensify noticeably near the surface. Tune `SKIM_ALT`/`SKIM_SPEED`.

- [ ] **Step 7: Commit**

```bash
git add src/game/feel/skim.ts tests/game/feel/skim.test.ts src/game/Game.ts
git commit -m "feat: skim intensity — the rush of screaming low over a surface"
```

---

### Task 7: The warp leap (cinematic sequence)

Turn the instant warp into a `charge → release → settle` event. A pure phase machine drives FOV scale, streak-tunnel intensity, and a white flash; the teleport fires at the release peak.

**Files:**
- Create: `src/game/feel/warpSequence.ts`
- Create: `tests/game/feel/warpSequence.test.ts`
- Modify: `src/render/scene/warpEffect.ts` (driven by sequence intensities)
- Modify: `src/render/CameraRig.ts` (accept a warp FOV scale)
- Modify: `src/game/Game.ts` (run the sequence; teleport at the peak)

**Interfaces:**
- Produces:
  - `type WarpPhase = "idle" | "charge" | "release" | "settle"`
  - `interface WarpSeq { phase: WarpPhase; t: number }`
  - `function idleWarp(): WarpSeq`
  - `function startWarp(): WarpSeq`
  - `function stepWarp(seq: WarpSeq, dt: number): { seq: WarpSeq; fovScale: number; tunnel: number; flash: number; teleport: boolean }`
  - constants `CHARGE_DUR`, `RELEASE_DUR`, `SETTLE_DUR`
- `CameraRig.setCockpit` gains a trailing `warpFovScale: number` parameter (multiplies the computed FOV).
- `warpEffect`'s `update` becomes `update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void` (no internal timer; `play()` removed).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/game/feel/warpSequence.test.ts
import { describe, it, expect } from "vitest";
import {
  idleWarp, startWarp, stepWarp,
  CHARGE_DUR, RELEASE_DUR, SETTLE_DUR,
} from "../../../src/game/feel/warpSequence";

describe("warpSequence", () => {
  it("idle does nothing — no teleport, no effect", () => {
    const r = stepWarp(idleWarp(), 1 / 60);
    expect(r.seq.phase).toBe("idle");
    expect(r.teleport).toBe(false);
    expect(r.tunnel).toBeCloseTo(0, 6);
    expect(r.flash).toBeCloseTo(0, 6);
  });

  it("charge phase pulls FOV in (scale < 1) and does not teleport", () => {
    const r = stepWarp(startWarp(), CHARGE_DUR * 0.5);
    expect(r.seq.phase).toBe("charge");
    expect(r.fovScale).toBeLessThan(1);
    expect(r.teleport).toBe(false);
  });

  it("teleports exactly once, on the charge→release transition", () => {
    let s = startWarp();
    let teleports = 0;
    // Step through the whole sequence in small ticks.
    for (let i = 0; i < 200; i++) {
      const r = stepWarp(s, 1 / 60);
      s = r.seq;
      if (r.teleport) teleports++;
    }
    expect(teleports).toBe(1);
  });

  it("release widens FOV (scale > 1) and lights the tunnel", () => {
    // Advance just past charge into release.
    let r = stepWarp(startWarp(), CHARGE_DUR + RELEASE_DUR * 0.25);
    expect(r.seq.phase).toBe("release");
    expect(r.fovScale).toBeGreaterThan(1);
    expect(r.tunnel).toBeGreaterThan(0.2);
  });

  it("returns to idle after the full duration with neutral FOV", () => {
    let s = startWarp();
    let last = stepWarp(s, 1 / 60);
    const total = CHARGE_DUR + RELEASE_DUR + SETTLE_DUR + 0.5;
    for (let acc = 0; acc < total; acc += 1 / 60) { last = stepWarp(last.seq, 1 / 60); }
    expect(last.seq.phase).toBe("idle");
    expect(last.fovScale).toBeCloseTo(1, 2);
    expect(last.tunnel).toBeCloseTo(0, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/feel/warpSequence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `warpSequence.ts`**

```ts
// src/game/feel/warpSequence.ts
export type WarpPhase = "idle" | "charge" | "release" | "settle";
export interface WarpSeq { phase: WarpPhase; t: number } // t = seconds elapsed in current phase

export const CHARGE_DUR = 1.0;
export const RELEASE_DUR = 0.4;
export const SETTLE_DUR = 0.9;

export function idleWarp(): WarpSeq { return { phase: "idle", t: 0 }; }
export function startWarp(): WarpSeq { return { phase: "charge", t: 0 }; }

interface WarpFrame { seq: WarpSeq; fovScale: number; tunnel: number; flash: number; teleport: boolean }

// FOV pulls in during charge, slams wide at release, eases back over settle.
export function stepWarp(seq: WarpSeq, dt: number): WarpFrame {
  if (seq.phase === "idle") {
    return { seq, fovScale: 1, tunnel: 0, flash: 0, teleport: false };
  }
  let { phase, t } = seq;
  t += dt;
  let teleport = false;

  // Advance through phase boundaries, carrying overflow time forward.
  if (phase === "charge" && t >= CHARGE_DUR) {
    t -= CHARGE_DUR; phase = "release"; teleport = true; // teleport fires once, at the peak
  }
  if (phase === "release" && t >= RELEASE_DUR) {
    t -= RELEASE_DUR; phase = "settle";
  }
  if (phase === "settle" && t >= SETTLE_DUR) {
    return { seq: idleWarp(), fovScale: 1, tunnel: 0, flash: 0, teleport };
  }

  let fovScale = 1, tunnel = 0, flash = 0;
  if (phase === "charge") {
    const k = t / CHARGE_DUR;          // 0→1
    fovScale = 1 - 0.18 * k;           // pull in to 0.82
    tunnel = 0.15 * k;
  } else if (phase === "release") {
    const k = t / RELEASE_DUR;         // 0→1
    fovScale = 1 + 0.4 * (1 - k);      // slam to ~1.4, easing down
    tunnel = 1;
    flash = 1 - k;                     // white bloom fades across release
  } else { // settle
    const k = t / SETTLE_DUR;          // 0→1
    fovScale = 1 + 0.08 * (1 - k);
    tunnel = 1 - k;
  }
  return { seq: { phase, t }, fovScale, tunnel, flash, teleport };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/feel/warpSequence.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Rewrite `warpEffect.ts` as an intensity-driven tunnel + flash**

Replace `src/render/scene/warpEffect.ts` entirely:

```ts
import * as THREE from "three";

// A forward streak-tunnel plus a full-frame white flash, both driven by intensities
// from the warp sequence (no internal timer).
export function createWarpEffect(scene: THREE.Scene): {
  update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void;
} {
  // Radial streak lines pointing forward (camera local -Z), built around the origin
  // and positioned at the camera each frame.
  const COUNT = 200;
  const verts = new Float32Array(COUNT * 6);
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    const r = 6 + (i % 7);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const o = i * 6;
    verts[o] = x; verts[o + 1] = y; verts[o + 2] = -8;       // near
    verts[o + 3] = x; verts[o + 4] = y; verts[o + 5] = -220; // far (forward)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  const tunnelMat = new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const tunnelLines = new THREE.LineSegments(geo, tunnelMat);
  tunnelLines.frustumCulled = false;
  tunnelLines.renderOrder = 999;
  scene.add(tunnelLines);

  // White flash: a big screen-facing sphere shell around the camera.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), flashMat);
  flashMesh.frustumCulled = false;
  flashMesh.renderOrder = 1000;
  scene.add(flashMesh);

  return {
    update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void {
      tunnelMat.opacity = Math.max(0, Math.min(1, tunnel)) * 0.9;
      flashMat.opacity = Math.max(0, Math.min(1, flash));
      tunnelLines.position.copy(cameraPos);
      flashMesh.position.copy(cameraPos);
    },
  };
}
```

Note: the tunnel lines are built in world axes here for simplicity; they read as a forward rush because they sit just in front of the camera during the brief release. If a tighter screen-locked tunnel is wanted, parent `tunnelLines` to the camera in a later tuning pass — out of scope for this task.

- [ ] **Step 6: Add the warp FOV scale to `CameraRig`**

In `src/render/CameraRig.ts`, add a trailing parameter to `setCockpit` and apply it to the FOV. Update the signature to end with `warpFovScale = 1` and change the FOV target line:
```ts
    const targetFov = fovForSpeed(speed) * warpFovScale;
```
Full signature becomes:
```ts
  setCockpit(
    shipRenderPos: THREE.Vector3,
    shipQuat: THREE.Quaternion,
    speed: number,
    accelMag: number,
    angular: AngularState,
    t: number,
    warpFovScale = 1,
  ): void {
```
During an active warp the FOV should respond fast, not over the slow 0.08 smoothing. Change the smoothing to snap when far from target during warp:
```ts
    const smoothing = warpFovScale !== 1 ? 0.5 : 0.08;
    this.currentFov += (targetFov - this.currentFov) * smoothing;
```

- [ ] **Step 7: Run the sequence from `Game.ts`**

In `src/game/Game.ts`:

Update imports (line 33-34 area):
```ts
import { warpTo } from "../sim/WarpDrive";
import { createWarpEffect } from "../render/scene/warpEffect";
import { WarpSeq, idleWarp, startWarp, stepWarp } from "./feel/warpSequence";
```
Change the `warpFx` field type (line 60) to the new shape:
```ts
  private warpFx!: { update(cameraPos: THREE.Vector3, tunnel: number, flash: number): void };
```
Add a warp-sequence field near it:
```ts
  private warpSeq: WarpSeq = idleWarp();
  private pendingWarpTarget: Body | null = null;
  private warpFovScale = 1;
```
Rewrite `doWarp` (lines 351-367) so it *arms* the sequence instead of teleporting immediately:
```ts
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
```
Add a private helper that performs the actual teleport (the old body of `doWarp`):
```ts
  private executeWarp(target: Body): void {
    this.ship = warpTo(this.ship, target);
    const o = this.ship.orientation;
    this.quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(o.x, o.y, o.z).normalize(),
    );
    this.rig.resetLook();
    this.phase = "InSpace";
  }
```
In `frame`, replace the old `this.warpFx.update(dt, this.renderer.camera.position);` (line 284) with the sequence drive. Place it **before** the cockpit `setCockpit` call so `warpFovScale` is current. The cleanest spot is just after `dt`/input handling, near the top of the body work — but it needs `dt`. Add this block right after the input-consume lines (after line 227) :
```ts
    // Drive the warp leap sequence (charge → release → settle).
    const w = stepWarp(this.warpSeq, dt);
    this.warpSeq = w.seq;
    this.warpFovScale = w.fovScale;
    if (w.teleport && this.pendingWarpTarget) {
      this.executeWarp(this.pendingWarpTarget);
      this.pendingWarpTarget = null;
    }
```
Then change the `warpFx.update` call (line 284) to:
```ts
    this.warpFx.update(this.renderer.camera.position, w.tunnel, w.flash);
```
And pass `warpFovScale` into the cockpit call (the `else` branch updated in Task 4):
```ts
      this.rig.setCockpit(
        shipVec,
        this.quat,
        this.ship.velocity.length(),
        this.lastAccelMag,
        this.angular,
        t / 1000,
        this.warpFovScale,
      );
```

- [ ] **Step 8: Build and test**

Run: `npm run build && npm test`
Expected: build clean; all feel-math tests green (including `warpSequence`). Fix any `tsc` complaint about the old `warpFx.play()` / `update(dt, ...)` usage — there should be none left after Step 7.

- [ ] **Step 9: Playtest the warp**

Run: `npm run dev`. Select the Moon, press warp. Confirm: FOV pulls in (~1s build), then a wide slam with a white flash and forward streak tunnel at the moment of arrival, then it eases back to stars facing the Moon. Tune `CHARGE_DUR`/`RELEASE_DUR`/`SETTLE_DUR` and the fovScale magnitudes to taste.

- [ ] **Step 10: Commit**

```bash
git add src/game/feel/warpSequence.ts tests/game/feel/warpSequence.test.ts src/render/scene/warpEffect.ts src/render/CameraRig.ts src/game/Game.ts
git commit -m "feat: cinematic warp leap (charge -> release -> settle)"
```

---

### Task 8: Full-journey playtest & tuning pass

No new code — a deliberate feel pass to confirm the systems compose into a joyful ride and to set final tunable values.

**Files:**
- Possibly modify: any `src/game/feel/*` constant, `Spacecraft.maxThrust`, `CameraRig` smoothing — tuning only.

- [ ] **Step 1: Full run**

Run: `npm run dev`. Fly the whole arc: launch off Earth (punchy thrust, momentum turns), cruise (FOV widens, streaks, shake), warp to the Moon (cinematic leap), descend and skim low and fast (streak boost), land (softer/swoopier — confirm it still lands via `evaluateTouchdown`).

- [ ] **Step 2: Tune to taste**

Adjust constants for the target feel: hand-flown Earth→Moon ~60–90s; FOV widening felt but not dizzying; shake felt, not nauseating; warp explosive but readable. Record final values.

- [ ] **Step 3: Regression check**

Run: `npm run build && npm test`
Expected: build clean, all tests green. Confirm landing and on-foot transitions still work (the swoopier handling must not break `Descending → LandedMoon → OnFoot`).

- [ ] **Step 4: Commit any tuning**

```bash
git add -A
git commit -m "tune: final feel pass for the Juice Pass"
```

---

## Self-Review

**Spec coverage:**
- System 1 (momentum turning) → Task 1. Punchier thrust → Task 2. Light assist → existing landing assist retained; momentum decay (`RATE_DAMP`) provides the "controlled, not twitchy" feel (no separate twitch-damp module needed — YAGNI).
- System 2: speed→FOV → Task 3; shake + g-lean → Task 4; intensified/streaking motion field → Task 5.
- System 3: warp leap → Task 7; skim → Task 6.
- Deferred (audio, authored pacing) → correctly absent.
- Testing approach (pure feel-math unit-tested, wiring playtested) → every pure module has a `tests/game/feel/*` suite; render wiring uses build + playtest steps. Final tuning → Task 8.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every step shows real code or an exact command.

**Type consistency:** `AngularState` defined in Task 1 (`turning.ts`), consumed by Task 4 (`shake.ts`, `CameraRig`) and Task 7. `setCockpit` parameters grow additively across Tasks 3→4→7 and each task shows the full current signature. `streakParams(speed, boost)` defined in Task 5, `boost` fed by `skimIntensity` in Task 6. `warpEffect.update` signature changes from `(dt, cameraPos?)` to `(cameraPos, tunnel, flash)` in Task 7, and all call sites are updated in the same task. `stepWarp` return shape matches its consumer in `Game.frame`.

**Ordering:** Each task builds only on earlier ones (turning → shake; streak → skim; fov/shake/streak → warp). Each ends with a green build and an independently demonstrable deliverable.
