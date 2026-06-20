# Galaxy Spaceship Simulator — Slice 1, Plan A: Simulation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fully unit-tested, headless simulation library (physics, celestial bodies, spacecraft, atmosphere, time, floating-origin, game-state machine, warp drive, astronaut, input mapping) for the Earth→Moon vertical slice — with no rendering.

**Architecture:** A pure-TypeScript simulation that depends on nothing browser-specific. All world state lives in double-precision (`number` = f64) "universe" coordinates in SI units (metres, kilograms, seconds). Forces are real Newtonian gravity summed n-body; the integrator is Velocity-Verlet at a fixed timestep. Distance between bodies is compressed by a single tunable constant so travel is minutes, not days, while planet radii and masses stay real so surface gravity is exact. The simulation never imports Three.js or touches the DOM, so every module runs and is tested headless under Vitest.

**Tech Stack:** TypeScript, Vite (build/dev server, used by Plan B), Vitest (unit tests). No runtime dependencies in this plan.

## Global Constraints

- Language: **TypeScript**, `strict: true` in `tsconfig.json`.
- Units everywhere in the simulation: **metres, kilograms, seconds, radians**. No mixed units.
- The simulation layer (`src/sim/**`) MUST NOT import `three`, touch `window`/`document`, or read wall-clock time. Keep it pure and deterministic.
- Gravitational constant: `G = 6.674e-11`.
- Distance compression constant default: `DISTANCE_SCALE = 0.25` (tuned in playtest).
- Fixed simulation timestep default: `FIXED_DT = 1 / 60` seconds.
- Test runner command: `npx vitest run` (single run) / `npx vitest` (watch).
- Commit after every task with a `feat:`/`test:`/`chore:` prefixed message.

---

## File Structure

```
package.json                       # scripts, devDeps
tsconfig.json                      # strict TS config
vitest.config.ts                   # test config
src/sim/
  Vec3.ts                          # minimal f64 3-vector math
  constants.ts                     # G, DISTANCE_SCALE, FIXED_DT
  Body.ts                          # celestial body type + real-data table + helpers
  gravity.ts                       # n-body gravitational acceleration
  integrator.ts                    # Velocity-Verlet step
  Spacecraft.ts                    # vessel state, throttle, fuel burn, thrust accel
  atmosphere.ts                    # exponential atmosphere density + drag accel
  TimeControl.ts                   # fixed-timestep accumulator
  FloatingOrigin.ts                # universe<->render rebasing
  GameState.ts                     # state machine + transitions
  WarpDrive.ts                     # target selection + safe-approach drop-out
  Astronaut.ts                     # on-foot 1/6-g walk physics
  input/
    bindings.ts                    # key code -> intent map (config)
    InputManager.ts                # event -> intent state
tests/sim/
  Vec3.test.ts
  Body.test.ts
  gravity.test.ts
  integrator.test.ts
  Spacecraft.test.ts
  atmosphere.test.ts
  TimeControl.test.ts
  FloatingOrigin.test.ts
  GameState.test.ts
  WarpDrive.test.ts
  Astronaut.test.ts
  InputManager.test.ts
```

Each `src/sim` file has one responsibility and is consumed through the explicit
signatures in each task's **Interfaces** block.

---

### Task 1: Project scaffold & test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/sim/.gitkeep`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npx vitest run` command and TypeScript compilation. All later tasks rely on this harness.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "galaxy-spaceship-sim",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `src/sim/.gitkeep`** (empty file so the directory exists)

- [ ] **Step 5: Write the smoke test `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install and run the harness**

Run: `npm install && npx vitest run`
Expected: PASS — 1 test passed.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/sim/.gitkeep tests/smoke.test.ts
git commit -m "chore: scaffold TS + Vitest test harness"
```

---

### Task 2: Vec3 math

**Files:**
- Create: `src/sim/Vec3.ts`
- Test: `tests/sim/Vec3.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class Vec3 { x:number; y:number; z:number; constructor(x?,y?,z?) }`
  with instance methods returning **new** `Vec3` (immutable style):
  `add(v:Vec3):Vec3`, `sub(v:Vec3):Vec3`, `scale(s:number):Vec3`,
  `dot(v:Vec3):number`, `length():number`, `lengthSq():number`,
  `normalize():Vec3` (returns zero vector if length is 0), `clone():Vec3`.
  Static: `Vec3.zero():Vec3`.

- [ ] **Step 1: Write the failing test `tests/sim/Vec3.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Vec3 } from "../../src/sim/Vec3";

describe("Vec3", () => {
  it("adds and subtracts", () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(4, 5, 6);
    expect(a.add(b)).toEqual(new Vec3(5, 7, 9));
    expect(b.sub(a)).toEqual(new Vec3(3, 3, 3));
  });

  it("scales and dots", () => {
    expect(new Vec3(1, 2, 3).scale(2)).toEqual(new Vec3(2, 4, 6));
    expect(new Vec3(1, 0, 0).dot(new Vec3(0, 1, 0))).toBe(0);
  });

  it("computes length and normalizes", () => {
    expect(new Vec3(3, 4, 0).length()).toBe(5);
    expect(new Vec3(3, 4, 0).lengthSq()).toBe(25);
    expect(new Vec3(0, 8, 0).normalize()).toEqual(new Vec3(0, 1, 0));
  });

  it("normalizing zero returns zero", () => {
    expect(new Vec3(0, 0, 0).normalize()).toEqual(new Vec3(0, 0, 0));
  });

  it("does not mutate the original", () => {
    const a = new Vec3(1, 1, 1);
    a.add(new Vec3(1, 1, 1));
    expect(a).toEqual(new Vec3(1, 1, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/Vec3.test.ts`
Expected: FAIL — cannot find module `Vec3`.

- [ ] **Step 3: Implement `src/sim/Vec3.ts`**

```ts
export class Vec3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
  ) {}

  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  add(v: Vec3): Vec3 {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vec3): Vec3 {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  lengthSq(): number {
    return this.dot(this);
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): Vec3 {
    const len = this.length();
    return len === 0 ? Vec3.zero() : this.scale(1 / len);
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/Vec3.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/Vec3.ts tests/sim/Vec3.test.ts
git commit -m "feat: add Vec3 f64 vector math"
```

---

### Task 3: Constants & celestial body data

**Files:**
- Create: `src/sim/constants.ts`
- Create: `src/sim/Body.ts`
- Test: `tests/sim/Body.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2).
- Produces:
  - `constants.ts`: `export const G = 6.674e-11; export const DISTANCE_SCALE = 0.25; export const FIXED_DT = 1 / 60;`
  - `Body.ts`:
    ```ts
    interface Body {
      name: string;
      mass: number;          // kg
      radius: number;        // m
      position: Vec3;        // m, universe coords
      atmosphere: AtmosphereParams | null;
    }
    interface AtmosphereParams { seaLevelDensity: number; scaleHeight: number; }
    function surfaceGravity(body: Body): number;   // m/s^2 = G*mass/radius^2
    function createSolarSystem(): Body[];          // [Earth, Moon], Moon at compressed distance
    ```
  - `createSolarSystem()` places Earth at origin and the Moon along +x at
    `EARTH_MOON_REAL_DISTANCE * DISTANCE_SCALE` (real distance `3.844e8` m).
    Earth has atmosphere; Moon has `null`.

- [ ] **Step 1: Write the failing test `tests/sim/Body.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { surfaceGravity, createSolarSystem } from "../../src/sim/Body";
import { DISTANCE_SCALE } from "../../src/sim/constants";

describe("Body", () => {
  it("computes Earth surface gravity ~9.81 m/s^2", () => {
    const [earth] = createSolarSystem();
    expect(surfaceGravity(earth)).toBeCloseTo(9.81, 1);
  });

  it("computes Moon surface gravity ~1.62 m/s^2", () => {
    const [, moon] = createSolarSystem();
    expect(surfaceGravity(moon)).toBeCloseTo(1.62, 1);
  });

  it("places the Moon at the compressed distance along +x", () => {
    const [, moon] = createSolarSystem();
    expect(moon.position.x).toBeCloseTo(3.844e8 * DISTANCE_SCALE, 0);
    expect(moon.position.y).toBe(0);
    expect(moon.position.z).toBe(0);
  });

  it("gives Earth an atmosphere and the Moon none", () => {
    const [earth, moon] = createSolarSystem();
    expect(earth.atmosphere).not.toBeNull();
    expect(moon.atmosphere).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/Body.test.ts`
Expected: FAIL — cannot find module `Body`.

- [ ] **Step 3: Implement `src/sim/constants.ts`**

```ts
export const G = 6.674e-11;
export const DISTANCE_SCALE = 0.25;
export const FIXED_DT = 1 / 60;
```

- [ ] **Step 4: Implement `src/sim/Body.ts`**

```ts
import { Vec3 } from "./Vec3";
import { G, DISTANCE_SCALE } from "./constants";

export interface AtmosphereParams {
  seaLevelDensity: number; // kg/m^3
  scaleHeight: number; // m
}

export interface Body {
  name: string;
  mass: number; // kg
  radius: number; // m
  position: Vec3; // m, universe coords
  atmosphere: AtmosphereParams | null;
}

export const EARTH_MOON_REAL_DISTANCE = 3.844e8; // m

export function surfaceGravity(body: Body): number {
  return (G * body.mass) / (body.radius * body.radius);
}

export function createSolarSystem(): Body[] {
  const earth: Body = {
    name: "Earth",
    mass: 5.972e24,
    radius: 6.371e6,
    position: Vec3.zero(),
    atmosphere: { seaLevelDensity: 1.225, scaleHeight: 8500 },
  };
  const moon: Body = {
    name: "Moon",
    mass: 7.342e22,
    radius: 1.737e6,
    position: new Vec3(EARTH_MOON_REAL_DISTANCE * DISTANCE_SCALE, 0, 0),
    atmosphere: null,
  };
  return [earth, moon];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/sim/Body.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/sim/constants.ts src/sim/Body.ts tests/sim/Body.test.ts
git commit -m "feat: add constants and celestial body data table"
```

---

### Task 4: N-body gravitational acceleration

**Files:**
- Create: `src/sim/gravity.ts`
- Test: `tests/sim/gravity.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2), `Body`, `G` (Task 3).
- Produces: `function gravityAccel(position: Vec3, bodies: Body[]): Vec3` —
  returns summed acceleration (m/s²) from every body, `a = Σ G·mᵢ·(pᵢ−p)/|pᵢ−p|³`.
  A body at exactly `position` (distance 0) contributes zero (guards divide-by-zero).

- [ ] **Step 1: Write the failing test `tests/sim/gravity.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { gravityAccel } from "../../src/sim/gravity";
import { Vec3 } from "../../src/sim/Vec3";
import { createSolarSystem, surfaceGravity } from "../../src/sim/Body";

describe("gravityAccel", () => {
  it("matches surface gravity at Earth's surface, pointing inward", () => {
    const bodies = createSolarSystem();
    const earth = bodies[0];
    const surface = new Vec3(earth.radius, 0, 0); // straight above center on +x
    const a = gravityAccel(surface, bodies);
    // dominated by Earth; magnitude ~9.81, direction toward center (-x)
    expect(a.length()).toBeCloseTo(surfaceGravity(earth), 1);
    expect(a.x).toBeLessThan(0);
  });

  it("returns zero when coincident with the only body's center", () => {
    const bodies = createSolarSystem();
    const a = gravityAccel(bodies[0].position, [bodies[0]]);
    expect(a.length()).toBe(0);
  });

  it("sums contributions from multiple bodies", () => {
    const bodies = createSolarSystem();
    const midpoint = new Vec3(bodies[1].position.x / 2, 0, 0);
    const a = gravityAccel(midpoint, bodies);
    // Earth pulls -x, Moon pulls +x; Earth wins so net is -x but small
    expect(a.x).toBeLessThan(0);
    expect(a.length()).toBeLessThan(surfaceGravity(bodies[0]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/gravity.test.ts`
Expected: FAIL — cannot find module `gravity`.

- [ ] **Step 3: Implement `src/sim/gravity.ts`**

```ts
import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { G } from "./constants";

export function gravityAccel(position: Vec3, bodies: Body[]): Vec3 {
  let acc = Vec3.zero();
  for (const body of bodies) {
    const delta = body.position.sub(position); // toward the body
    const distSq = delta.lengthSq();
    if (distSq === 0) continue;
    const dist = Math.sqrt(distSq);
    const magnitude = (G * body.mass) / distSq;
    acc = acc.add(delta.scale(magnitude / dist)); // delta/dist = unit vector
  }
  return acc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/gravity.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/gravity.ts tests/sim/gravity.test.ts
git commit -m "feat: add n-body gravitational acceleration"
```

---

### Task 5: Velocity-Verlet integrator

**Files:**
- Create: `src/sim/integrator.ts`
- Test: `tests/sim/integrator.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2).
- Produces:
  ```ts
  interface MotionState { position: Vec3; velocity: Vec3; }
  type AccelFn = (position: Vec3, velocity: Vec3) => Vec3;
  function verletStep(state: MotionState, dt: number, accel: AccelFn): MotionState;
  ```
  Velocity-Verlet: `x' = x + v·dt + ½·a·dt²`, then `v' = v + ½·(a + a')·dt`,
  where `a = accel(x, v)` and `a' = accel(x', v)`. Returns a new `MotionState`
  (does not mutate input). The `velocity` argument to `accel` is the start-of-step
  velocity for both evaluations (lets velocity-dependent forces like drag plug in).

- [ ] **Step 1: Write the failing test `tests/sim/integrator.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { verletStep, MotionState } from "../../src/sim/integrator";
import { Vec3 } from "../../src/sim/Vec3";
import { gravityAccel } from "../../src/sim/gravity";
import { Body } from "../../src/sim/Body";
import { G } from "../../src/sim/constants";

// A single heavy point mass at origin for a clean analytic orbit.
const center: Body = {
  name: "C",
  mass: 5.972e24,
  radius: 1,
  position: Vec3.zero(),
  atmosphere: null,
};

describe("verletStep", () => {
  it("keeps a circular orbit's radius stable over one period", () => {
    const r = 7.0e6;
    const speed = Math.sqrt((G * center.mass) / r); // circular velocity
    let state: MotionState = {
      position: new Vec3(r, 0, 0),
      velocity: new Vec3(0, speed, 0),
    };
    const dt = 1; // 1 second steps
    const period = 2 * Math.PI * Math.sqrt(r ** 3 / (G * center.mass));
    const steps = Math.round(period / dt);
    for (let i = 0; i < steps; i++) {
      state = verletStep(state, dt, (pos) => gravityAccel(pos, [center]));
    }
    // radius drift under 1% after a full orbit
    expect(state.position.length()).toBeGreaterThan(r * 0.99);
    expect(state.position.length()).toBeLessThan(r * 1.01);
  });

  it("applies constant acceleration like kinematics (x = ½ a t^2)", () => {
    let state: MotionState = { position: Vec3.zero(), velocity: Vec3.zero() };
    const a = new Vec3(0, 0, 10);
    const dt = 0.01;
    for (let i = 0; i < 100; i++) {
      state = verletStep(state, dt, () => a);
    }
    // after t=1s: position z = 0.5*10*1^2 = 5, velocity z = 10
    expect(state.position.z).toBeCloseTo(5, 4);
    expect(state.velocity.z).toBeCloseTo(10, 4);
  });

  it("does not mutate the input state", () => {
    const original: MotionState = {
      position: new Vec3(1, 0, 0),
      velocity: new Vec3(0, 1, 0),
    };
    verletStep(original, 1, () => new Vec3(0, 0, 0));
    expect(original.position).toEqual(new Vec3(1, 0, 0));
    expect(original.velocity).toEqual(new Vec3(0, 1, 0));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/integrator.test.ts`
Expected: FAIL — cannot find module `integrator`.

- [ ] **Step 3: Implement `src/sim/integrator.ts`**

```ts
import { Vec3 } from "./Vec3";

export interface MotionState {
  position: Vec3;
  velocity: Vec3;
}

export type AccelFn = (position: Vec3, velocity: Vec3) => Vec3;

export function verletStep(
  state: MotionState,
  dt: number,
  accel: AccelFn,
): MotionState {
  const a = accel(state.position, state.velocity);
  const newPosition = state.position
    .add(state.velocity.scale(dt))
    .add(a.scale(0.5 * dt * dt));
  const aNext = accel(newPosition, state.velocity);
  const newVelocity = state.velocity.add(a.add(aNext).scale(0.5 * dt));
  return { position: newPosition, velocity: newVelocity };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/integrator.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/integrator.ts tests/sim/integrator.test.ts
git commit -m "feat: add velocity-verlet integrator"
```

---

### Task 6: Spacecraft model

**Files:**
- Create: `src/sim/Spacecraft.ts`
- Test: `tests/sim/Spacecraft.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2).
- Produces:
  ```ts
  interface Spacecraft {
    position: Vec3; velocity: Vec3;
    orientation: Vec3;   // unit vector the main engine pushes ALONG (ship "up"/nose)
    dryMass: number;     // kg
    fuelMass: number;    // kg (current)
    maxThrust: number;   // N at full throttle
    throttle: number;    // 0..1
    exhaustVelocity: number; // m/s, for fuel burn rate (thrust = mdot * ve)
  }
  function createSpacecraft(position: Vec3): Spacecraft;
  function totalMass(s: Spacecraft): number;          // dryMass + fuelMass
  function thrustAccel(s: Spacecraft): Vec3;          // (throttle*maxThrust/mass) along orientation; zero if out of fuel
  function burnFuel(s: Spacecraft, dt: number): Spacecraft; // reduces fuelMass by mdot*dt, clamped at 0
  ```
  Fuel mass flow `mdot = throttle * maxThrust / exhaustVelocity`. When
  `fuelMass <= 0`, `thrustAccel` returns zero regardless of throttle.

- [ ] **Step 1: Write the failing test `tests/sim/Spacecraft.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  createSpacecraft,
  totalMass,
  thrustAccel,
  burnFuel,
} from "../../src/sim/Spacecraft";
import { Vec3 } from "../../src/sim/Vec3";

describe("Spacecraft", () => {
  it("produces zero thrust at zero throttle", () => {
    const s = createSpacecraft(Vec3.zero());
    s.throttle = 0;
    expect(thrustAccel(s).length()).toBe(0);
  });

  it("produces thrust along orientation scaled by throttle/mass", () => {
    const s = createSpacecraft(Vec3.zero());
    s.orientation = new Vec3(0, 1, 0);
    s.throttle = 1;
    const a = thrustAccel(s);
    expect(a.x).toBe(0);
    expect(a.z).toBe(0);
    expect(a.y).toBeCloseTo(s.maxThrust / totalMass(s), 6);
  });

  it("burns fuel proportional to throttle and time", () => {
    const s = createSpacecraft(Vec3.zero());
    s.throttle = 1;
    const before = s.fuelMass;
    const after = burnFuel(s, 1);
    const mdot = (s.throttle * s.maxThrust) / s.exhaustVelocity;
    expect(after.fuelMass).toBeCloseTo(before - mdot, 3);
  });

  it("never burns below zero fuel and makes thrust zero when empty", () => {
    let s = createSpacecraft(Vec3.zero());
    s.throttle = 1;
    s.fuelMass = 0;
    s = burnFuel(s, 10);
    expect(s.fuelMass).toBe(0);
    expect(thrustAccel(s).length()).toBe(0);
  });

  it("burnFuel does not mutate the input", () => {
    const s = createSpacecraft(Vec3.zero());
    s.throttle = 1;
    const fuelBefore = s.fuelMass;
    burnFuel(s, 1);
    expect(s.fuelMass).toBe(fuelBefore);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/Spacecraft.test.ts`
Expected: FAIL — cannot find module `Spacecraft`.

- [ ] **Step 3: Implement `src/sim/Spacecraft.ts`**

```ts
import { Vec3 } from "./Vec3";

export interface Spacecraft {
  position: Vec3;
  velocity: Vec3;
  orientation: Vec3; // unit vector main engine pushes along
  dryMass: number;
  fuelMass: number;
  maxThrust: number;
  throttle: number;
  exhaustVelocity: number;
}

// Tunable starting values; refined in playtest (Plan B).
export function createSpacecraft(position: Vec3): Spacecraft {
  return {
    position: position.clone(),
    velocity: Vec3.zero(),
    orientation: new Vec3(0, 1, 0),
    dryMass: 5000,
    fuelMass: 15000,
    maxThrust: 1.2e6, // N — strong enough to launch off Earth
    throttle: 0,
    exhaustVelocity: 3000, // m/s
  };
}

export function totalMass(s: Spacecraft): number {
  return s.dryMass + s.fuelMass;
}

export function thrustAccel(s: Spacecraft): Vec3 {
  if (s.fuelMass <= 0 || s.throttle <= 0) return Vec3.zero();
  const force = s.throttle * s.maxThrust;
  return s.orientation.normalize().scale(force / totalMass(s));
}

export function burnFuel(s: Spacecraft, dt: number): Spacecraft {
  const mdot = (s.throttle * s.maxThrust) / s.exhaustVelocity;
  const newFuel = Math.max(0, s.fuelMass - mdot * dt);
  return { ...s, fuelMass: newFuel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/Spacecraft.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/Spacecraft.ts tests/sim/Spacecraft.test.ts
git commit -m "feat: add spacecraft model with throttle, thrust, fuel burn"
```

---

### Task 7: Atmosphere & drag

**Files:**
- Create: `src/sim/atmosphere.ts`
- Test: `tests/sim/atmosphere.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2), `Body`, `AtmosphereParams` (Task 3), `Spacecraft`, `totalMass` (Task 6).
- Produces:
  ```ts
  function airDensity(body: Body, altitude: number): number; // kg/m^3; 0 if no atmosphere or altitude<0 handling
  function dragAccel(s: Spacecraft, bodies: Body[]): Vec3;    // -½ρv²·Cd·A / mass, opposing velocity
  ```
  `airDensity` uses `ρ = ρ0 · exp(−altitude / scaleHeight)`; returns 0 for a body
  with no atmosphere. `altitude` is height above the body surface (m).
  `dragAccel` sums over bodies that have atmosphere, using altitude = distance to
  body center − body radius (clamped at 0), with fixed `Cd = 0.5`, `A = 10` m².

- [ ] **Step 1: Write the failing test `tests/sim/atmosphere.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { airDensity, dragAccel } from "../../src/sim/atmosphere";
import { createSolarSystem } from "../../src/sim/Body";
import { createSpacecraft } from "../../src/sim/Spacecraft";
import { Vec3 } from "../../src/sim/Vec3";

describe("atmosphere", () => {
  it("returns sea-level density at altitude 0 for Earth", () => {
    const [earth] = createSolarSystem();
    expect(airDensity(earth, 0)).toBeCloseTo(1.225, 3);
  });

  it("decreases density exponentially with altitude", () => {
    const [earth] = createSolarSystem();
    const sh = earth.atmosphere!.scaleHeight;
    expect(airDensity(earth, sh)).toBeCloseTo(1.225 / Math.E, 3);
  });

  it("returns zero density for an airless body (Moon)", () => {
    const [, moon] = createSolarSystem();
    expect(airDensity(moon, 0)).toBe(0);
  });

  it("produces drag opposing velocity inside Earth's atmosphere", () => {
    const [earth] = createSolarSystem();
    const s = createSpacecraft(new Vec3(earth.radius + 1000, 0, 0));
    s.velocity = new Vec3(0, 200, 0); // moving +y fast, low altitude
    const a = dragAccel(s, [earth]);
    expect(a.y).toBeLessThan(0); // opposes +y motion
    expect(a.length()).toBeGreaterThan(0);
  });

  it("produces no drag in vacuum near the Moon", () => {
    const [, moon] = createSolarSystem();
    const s = createSpacecraft(moon.position.add(new Vec3(moon.radius + 1000, 0, 0)));
    s.velocity = new Vec3(0, 200, 0);
    expect(dragAccel(s, [moon]).length()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/atmosphere.test.ts`
Expected: FAIL — cannot find module `atmosphere`.

- [ ] **Step 3: Implement `src/sim/atmosphere.ts`**

```ts
import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { Spacecraft, totalMass } from "./Spacecraft";

const DRAG_CD = 0.5;
const DRAG_AREA = 10; // m^2

export function airDensity(body: Body, altitude: number): number {
  if (!body.atmosphere) return 0;
  const h = Math.max(0, altitude);
  return body.atmosphere.seaLevelDensity * Math.exp(-h / body.atmosphere.scaleHeight);
}

export function dragAccel(s: Spacecraft, bodies: Body[]): Vec3 {
  const speed = s.velocity.length();
  if (speed === 0) return Vec3.zero();
  let acc = Vec3.zero();
  for (const body of bodies) {
    if (!body.atmosphere) continue;
    const altitude = s.position.sub(body.position).length() - body.radius;
    const rho = airDensity(body, altitude);
    if (rho === 0) continue;
    // drag force magnitude = ½ρv²·Cd·A ; acceleration opposes velocity
    const forceMag = 0.5 * rho * speed * speed * DRAG_CD * DRAG_AREA;
    const accelMag = forceMag / totalMass(s);
    acc = acc.add(s.velocity.normalize().scale(-accelMag));
  }
  return acc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/atmosphere.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/atmosphere.ts tests/sim/atmosphere.test.ts
git commit -m "feat: add exponential atmosphere density and drag"
```

---

### Task 8: TimeControl fixed-timestep accumulator

**Files:**
- Create: `src/sim/TimeControl.ts`
- Test: `tests/sim/TimeControl.test.ts`

**Interfaces:**
- Consumes: `FIXED_DT` (Task 3).
- Produces:
  ```ts
  interface TimeControl { accumulator: number; timeScale: number; fixedDt: number; }
  function createTimeControl(): TimeControl;
  // Given a real frame delta (seconds), returns how many fixed steps to run and the
  // leftover accumulator. timeScale multiplies frameDelta (warp/time-accel).
  function advance(tc: TimeControl, frameDelta: number): { steps: number; next: TimeControl };
  ```
  `advance` adds `frameDelta * timeScale` to the accumulator, then yields
  `floor(accumulator / fixedDt)` steps and subtracts them. Caps `steps` at a
  safety maximum of `1000` to avoid spiral-of-death on a long pause.

- [ ] **Step 1: Write the failing test `tests/sim/TimeControl.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createTimeControl, advance } from "../../src/sim/TimeControl";
import { FIXED_DT } from "../../src/sim/constants";

describe("TimeControl", () => {
  it("yields one step per fixed_dt of real time", () => {
    const tc = createTimeControl();
    const { steps } = advance(tc, FIXED_DT);
    expect(steps).toBe(1);
  });

  it("accumulates fractional remainder across calls", () => {
    let tc = createTimeControl();
    let r = advance(tc, FIXED_DT * 0.6);
    expect(r.steps).toBe(0);
    tc = r.next;
    r = advance(tc, FIXED_DT * 0.6);
    expect(r.steps).toBe(1); // 1.2 dt total -> 1 step, 0.2 left
    expect(r.next.accumulator).toBeCloseTo(FIXED_DT * 0.2, 6);
  });

  it("multiplies elapsed time by timeScale (warp)", () => {
    const tc = { ...createTimeControl(), timeScale: 100 };
    const { steps } = advance(tc, FIXED_DT);
    expect(steps).toBe(100);
  });

  it("caps steps to prevent spiral of death", () => {
    const tc = createTimeControl();
    const { steps } = advance(tc, FIXED_DT * 100000);
    expect(steps).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/TimeControl.test.ts`
Expected: FAIL — cannot find module `TimeControl`.

- [ ] **Step 3: Implement `src/sim/TimeControl.ts`**

```ts
import { FIXED_DT } from "./constants";

const MAX_STEPS = 1000;

export interface TimeControl {
  accumulator: number;
  timeScale: number;
  fixedDt: number;
}

export function createTimeControl(): TimeControl {
  return { accumulator: 0, timeScale: 1, fixedDt: FIXED_DT };
}

export function advance(
  tc: TimeControl,
  frameDelta: number,
): { steps: number; next: TimeControl } {
  let acc = tc.accumulator + frameDelta * tc.timeScale;
  let steps = Math.floor(acc / tc.fixedDt);
  if (steps > MAX_STEPS) steps = MAX_STEPS;
  acc -= steps * tc.fixedDt;
  return { steps, next: { ...tc, accumulator: acc } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/TimeControl.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/TimeControl.ts tests/sim/TimeControl.test.ts
git commit -m "feat: add fixed-timestep accumulator with timescale"
```

---

### Task 9: FloatingOrigin

**Files:**
- Create: `src/sim/FloatingOrigin.ts`
- Test: `tests/sim/FloatingOrigin.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2).
- Produces:
  ```ts
  interface FloatingOrigin { offset: Vec3; threshold: number; }
  function createFloatingOrigin(threshold?: number): FloatingOrigin; // default 1e4 m
  // Render position = universe position - offset.
  function toRender(fo: FloatingOrigin, universePos: Vec3): Vec3;
  // If the player's render position exceeds threshold, rebase offset to the player's
  // universe position. Returns the new origin (offset) — relative positions are preserved.
  function rebase(fo: FloatingOrigin, playerUniversePos: Vec3): FloatingOrigin;
  ```

- [ ] **Step 1: Write the failing test `tests/sim/FloatingOrigin.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  createFloatingOrigin,
  toRender,
  rebase,
} from "../../src/sim/FloatingOrigin";
import { Vec3 } from "../../src/sim/Vec3";

describe("FloatingOrigin", () => {
  it("renders universe positions relative to the offset", () => {
    const fo = { offset: new Vec3(100, 0, 0), threshold: 1e4 };
    expect(toRender(fo, new Vec3(150, 0, 0))).toEqual(new Vec3(50, 0, 0));
  });

  it("rebases when the player drifts past the threshold", () => {
    let fo = createFloatingOrigin(1e4);
    const player = new Vec3(2e4, 0, 0); // render dist 2e4 > 1e4
    fo = rebase(fo, player);
    // after rebase, player renders at ~origin
    expect(toRender(fo, player).length()).toBeCloseTo(0, 6);
  });

  it("does not rebase when within the threshold", () => {
    const fo = createFloatingOrigin(1e4);
    const player = new Vec3(5e3, 0, 0);
    const after = rebase(fo, player);
    expect(after.offset).toEqual(fo.offset);
  });

  it("preserves relative positions exactly across a rebase", () => {
    let fo = createFloatingOrigin(1e4);
    const player = new Vec3(2e4, 0, 0);
    const other = new Vec3(2e4 + 37, 5, -9);
    const relBefore = toRender(fo, other).sub(toRender(fo, player));
    fo = rebase(fo, player);
    const relAfter = toRender(fo, other).sub(toRender(fo, player));
    expect(relAfter.x).toBeCloseTo(relBefore.x, 6);
    expect(relAfter.y).toBeCloseTo(relBefore.y, 6);
    expect(relAfter.z).toBeCloseTo(relBefore.z, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/FloatingOrigin.test.ts`
Expected: FAIL — cannot find module `FloatingOrigin`.

- [ ] **Step 3: Implement `src/sim/FloatingOrigin.ts`**

```ts
import { Vec3 } from "./Vec3";

export interface FloatingOrigin {
  offset: Vec3;
  threshold: number;
}

export function createFloatingOrigin(threshold = 1e4): FloatingOrigin {
  return { offset: Vec3.zero(), threshold };
}

export function toRender(fo: FloatingOrigin, universePos: Vec3): Vec3 {
  return universePos.sub(fo.offset);
}

export function rebase(
  fo: FloatingOrigin,
  playerUniversePos: Vec3,
): FloatingOrigin {
  const renderPos = toRender(fo, playerUniversePos);
  if (renderPos.length() <= fo.threshold) return fo;
  return { ...fo, offset: playerUniversePos.clone() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/FloatingOrigin.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/FloatingOrigin.ts tests/sim/FloatingOrigin.test.ts
git commit -m "feat: add floating-origin universe-to-render rebasing"
```

---

### Task 10: GameState machine

**Files:**
- Create: `src/sim/GameState.ts`
- Test: `tests/sim/GameState.test.ts`

**Interfaces:**
- Consumes: nothing (string-literal states).
- Produces:
  ```ts
  type Phase = "LandedEarth" | "Launching" | "InSpace" | "Descending"
             | "LandedMoon" | "OnFoot";
  function initialPhase(): Phase;                 // "LandedEarth"
  function canTransition(from: Phase, to: Phase): boolean;
  function transition(from: Phase, to: Phase): Phase; // throws Error on invalid
  ```
  Allowed transitions:
  - `LandedEarth → Launching`
  - `Launching → InSpace`
  - `InSpace → Descending` (and `Descending → InSpace` if you abort the descent)
  - `Descending → LandedMoon`
  - `LandedMoon → OnFoot` and `OnFoot → LandedMoon`
  - `LandedMoon → Launching` (lift off again)
  - Any non-listed pair is invalid. (`OnFoot` requires being landed first.)

- [ ] **Step 1: Write the failing test `tests/sim/GameState.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  initialPhase,
  canTransition,
  transition,
} from "../../src/sim/GameState";

describe("GameState", () => {
  it("starts landed on Earth", () => {
    expect(initialPhase()).toBe("LandedEarth");
  });

  it("allows the nominal mission flow", () => {
    expect(canTransition("LandedEarth", "Launching")).toBe(true);
    expect(canTransition("Launching", "InSpace")).toBe(true);
    expect(canTransition("InSpace", "Descending")).toBe(true);
    expect(canTransition("Descending", "LandedMoon")).toBe(true);
    expect(canTransition("LandedMoon", "OnFoot")).toBe(true);
    expect(canTransition("OnFoot", "LandedMoon")).toBe(true);
  });

  it("allows aborting a descent back to space and relaunching", () => {
    expect(canTransition("Descending", "InSpace")).toBe(true);
    expect(canTransition("LandedMoon", "Launching")).toBe(true);
  });

  it("forbids reaching OnFoot without landing", () => {
    expect(canTransition("InSpace", "OnFoot")).toBe(false);
    expect(canTransition("LandedEarth", "OnFoot")).toBe(false);
  });

  it("transition returns the new phase on a valid move", () => {
    expect(transition("LandedEarth", "Launching")).toBe("Launching");
  });

  it("transition throws on an invalid move", () => {
    expect(() => transition("InSpace", "OnFoot")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/GameState.test.ts`
Expected: FAIL — cannot find module `GameState`.

- [ ] **Step 3: Implement `src/sim/GameState.ts`**

```ts
export type Phase =
  | "LandedEarth"
  | "Launching"
  | "InSpace"
  | "Descending"
  | "LandedMoon"
  | "OnFoot";

const ALLOWED: Record<Phase, Phase[]> = {
  LandedEarth: ["Launching"],
  Launching: ["InSpace"],
  InSpace: ["Descending"],
  Descending: ["LandedMoon", "InSpace"],
  LandedMoon: ["OnFoot", "Launching"],
  OnFoot: ["LandedMoon"],
};

export function initialPhase(): Phase {
  return "LandedEarth";
}

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(from: Phase, to: Phase): Phase {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} -> ${to}`);
  }
  return to;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/GameState.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/GameState.ts tests/sim/GameState.test.ts
git commit -m "feat: add game-state machine with validated transitions"
```

---

### Task 11: WarpDrive

**Files:**
- Create: `src/sim/WarpDrive.ts`
- Test: `tests/sim/WarpDrive.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2), `Body` (Task 3), `Spacecraft` (Task 6).
- Produces:
  ```ts
  // Distance from the target body's CENTER at which warp drops you out:
  // a safe approach = target.radius * SAFE_APPROACH_RADII (default 5x).
  const SAFE_APPROACH_RADII = 5;
  function safeApproachDistance(target: Body): number; // target.radius * SAFE_APPROACH_RADII
  // Compute the post-warp spacecraft: positioned on the line from target toward the
  // ship's current position, at safeApproachDistance from target center, oriented
  // toward the target, velocity zeroed (a clean arrival). Pure; returns a new Spacecraft.
  function warpTo(ship: Spacecraft, target: Body): Spacecraft;
  ```

- [ ] **Step 1: Write the failing test `tests/sim/WarpDrive.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { safeApproachDistance, warpTo } from "../../src/sim/WarpDrive";
import { createSolarSystem } from "../../src/sim/Body";
import { createSpacecraft } from "../../src/sim/Spacecraft";
import { Vec3 } from "../../src/sim/Vec3";

describe("WarpDrive", () => {
  it("computes a safe approach distance of 5 body radii", () => {
    const [, moon] = createSolarSystem();
    expect(safeApproachDistance(moon)).toBeCloseTo(moon.radius * 5, 0);
  });

  it("drops the ship out at the safe approach distance from target center", () => {
    const [earth, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(earth.radius, 0, 0));
    const after = warpTo(ship, moon);
    const dist = after.position.sub(moon.position).length();
    expect(dist).toBeCloseTo(safeApproachDistance(moon), 0);
  });

  it("places the ship between the target and its prior position", () => {
    const [earth, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(earth.radius, 0, 0));
    const after = warpTo(ship, moon);
    // ship started on -x side of the Moon, so drop-out x < moon.x
    expect(after.position.x).toBeLessThan(moon.position.x);
  });

  it("orients the ship toward the target and zeroes velocity", () => {
    const [earth, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(earth.radius, 0, 0));
    ship.velocity = new Vec3(1000, 200, 50);
    const after = warpTo(ship, moon);
    expect(after.velocity.length()).toBe(0);
    // orientation points from ship toward moon (+x)
    const toTarget = moon.position.sub(after.position).normalize();
    expect(after.orientation.normalize().dot(toTarget)).toBeCloseTo(1, 6);
  });

  it("does not mutate the input ship", () => {
    const [, moon] = createSolarSystem();
    const ship = createSpacecraft(new Vec3(1e7, 0, 0));
    const posBefore = ship.position.clone();
    warpTo(ship, moon);
    expect(ship.position).toEqual(posBefore);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/WarpDrive.test.ts`
Expected: FAIL — cannot find module `WarpDrive`.

- [ ] **Step 3: Implement `src/sim/WarpDrive.ts`**

```ts
import { Vec3 } from "./Vec3";
import { Body } from "./Body";
import { Spacecraft } from "./Spacecraft";

export const SAFE_APPROACH_RADII = 5;

export function safeApproachDistance(target: Body): number {
  return target.radius * SAFE_APPROACH_RADII;
}

export function warpTo(ship: Spacecraft, target: Body): Spacecraft {
  // Unit vector from target toward the ship's current position.
  const fromTarget = ship.position.sub(target.position).normalize();
  const dropPosition = target.position.add(
    fromTarget.scale(safeApproachDistance(target)),
  );
  const orientation = target.position.sub(dropPosition).normalize();
  return {
    ...ship,
    position: dropPosition,
    velocity: Vec3.zero(),
    orientation,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/WarpDrive.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/WarpDrive.ts tests/sim/WarpDrive.test.ts
git commit -m "feat: add warp drive with safe-approach drop-out"
```

---

### Task 12: Astronaut walk physics

**Files:**
- Create: `src/sim/Astronaut.ts`
- Test: `tests/sim/Astronaut.test.ts`

**Interfaces:**
- Consumes: `Vec3` (Task 2), `Body`, `surfaceGravity` (Task 3).
- Produces:
  ```ts
  interface Astronaut {
    position: Vec3;   // universe coords
    velocity: Vec3;
    onGround: boolean;
  }
  function createAstronaut(position: Vec3): Astronaut;
  // One fixed step of on-foot motion on a body. `walkDir` is a desired horizontal
  // move direction (unit or zero) in local tangent space mapped to world by caller;
  // `jump` triggers an upward impulse if onGround. Applies the body's real gravity
  // along the local "down" (toward body center). Returns a new Astronaut.
  function stepAstronaut(
    a: Astronaut, body: Body, walkDir: Vec3, jump: boolean, dt: number
  ): Astronaut;
  ```
  Constants: walk speed `WALK_SPEED = 3` m/s; jump impulse `JUMP_SPEED = 4` m/s.
  Ground is the sphere at `body.radius` from center; the astronaut cannot sink
  below it (`onGround` clamps altitude to surface and zeroes inward velocity).

- [ ] **Step 1: Write the failing test `tests/sim/Astronaut.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createAstronaut, stepAstronaut } from "../../src/sim/Astronaut";
import { createSolarSystem } from "../../src/sim/Body";
import { Vec3 } from "../../src/sim/Vec3";

// Use the Moon for 1/6-g behavior. Put astronaut on the +x surface.
function moonSurfaceAstronaut() {
  const [, moon] = createSolarSystem();
  const a = createAstronaut(new Vec3(moon.radius, 0, 0).add(moon.position));
  a.onGround = true;
  return { a, moon };
}

describe("Astronaut", () => {
  it("stays on the surface when standing still", () => {
    const { a, moon } = moonSurfaceAstronaut();
    const next = stepAstronaut(a, moon, Vec3.zero(), false, 1 / 60);
    const altitude = next.position.sub(moon.position).length() - moon.radius;
    expect(altitude).toBeCloseTo(0, 3);
    expect(next.onGround).toBe(true);
  });

  it("moves horizontally at walk speed", () => {
    const { a, moon } = moonSurfaceAstronaut();
    // horizontal (tangent) direction at +x surface is +y
    const next = stepAstronaut(a, moon, new Vec3(0, 1, 0), false, 1);
    // moved roughly WALK_SPEED metres in +y over 1 second
    expect(next.position.y).toBeGreaterThan(2.5);
    expect(next.position.y).toBeLessThan(3.5);
  });

  it("jumps higher under Moon gravity than it would on Earth (1/6 g feel)", () => {
    const { a, moon } = moonSurfaceAstronaut();
    let s = stepAstronaut(a, moon, Vec3.zero(), true, 1 / 60); // jump
    let maxAlt = 0;
    for (let i = 0; i < 600; i++) {
      s = stepAstronaut(s, moon, Vec3.zero(), false, 1 / 60);
      const alt = s.position.sub(moon.position).length() - moon.radius;
      maxAlt = Math.max(maxAlt, alt);
    }
    // apex ~ v^2/(2g) = 16/(2*1.62) ~ 4.9 m on the Moon; assert clearly > 1 m
    expect(maxAlt).toBeGreaterThan(1);
  });

  it("does not sink below the surface", () => {
    const { a, moon } = moonSurfaceAstronaut();
    let s = a;
    for (let i = 0; i < 120; i++) {
      s = stepAstronaut(s, moon, Vec3.zero(), false, 1 / 60);
    }
    const altitude = s.position.sub(moon.position).length() - moon.radius;
    expect(altitude).toBeGreaterThanOrEqual(-0.001);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/Astronaut.test.ts`
Expected: FAIL — cannot find module `Astronaut`.

- [ ] **Step 3: Implement `src/sim/Astronaut.ts`**

```ts
import { Vec3 } from "./Vec3";
import { Body, surfaceGravity } from "./Body";

const WALK_SPEED = 3; // m/s
const JUMP_SPEED = 4; // m/s

export interface Astronaut {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
}

export function createAstronaut(position: Vec3): Astronaut {
  return { position: position.clone(), velocity: Vec3.zero(), onGround: false };
}

export function stepAstronaut(
  a: Astronaut,
  body: Body,
  walkDir: Vec3,
  jump: boolean,
  dt: number,
): Astronaut {
  const up = a.position.sub(body.position).normalize(); // local "up"
  const g = surfaceGravity(body);

  // Start from current vertical velocity (component along up); horizontal is set by walk.
  let vertical = a.velocity.dot(up);
  if (jump && a.onGround) {
    vertical = JUMP_SPEED;
  }

  // Horizontal walk velocity: project requested direction onto the tangent plane.
  const tangentDir = walkDir.sub(up.scale(walkDir.dot(up)));
  const horizontalVel =
    tangentDir.lengthSq() > 0 ? tangentDir.normalize().scale(WALK_SPEED) : Vec3.zero();

  // Apply gravity to vertical velocity.
  vertical -= g * dt;

  const velocity = horizontalVel.add(up.scale(vertical));
  let position = a.position.add(velocity.scale(dt));

  // Clamp to surface.
  let onGround = false;
  const altitude = position.sub(body.position).length() - body.radius;
  if (altitude <= 0) {
    const newUp = position.sub(body.position).normalize();
    position = body.position.add(newUp.scale(body.radius));
    onGround = true;
    // remove inward vertical velocity, keep horizontal
    const inward = velocity.dot(newUp);
    const corrected = inward < 0 ? velocity.sub(newUp.scale(inward)) : velocity;
    return { position, velocity: corrected, onGround };
  }

  return { position, velocity, onGround };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/Astronaut.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/Astronaut.ts tests/sim/Astronaut.test.ts
git commit -m "feat: add astronaut on-foot walk physics with real gravity"
```

---

### Task 13: Input bindings & InputManager

**Files:**
- Create: `src/sim/input/bindings.ts`
- Create: `src/sim/input/InputManager.ts`
- Test: `tests/sim/InputManager.test.ts`

**Interfaces:**
- Consumes: nothing (pure logic; no DOM).
- Produces:
  - `bindings.ts`:
    ```ts
    type Intent =
      | "throttleUp" | "throttleDown"
      | "pitchUp" | "pitchDown" | "yawLeft" | "yawRight" | "rollLeft" | "rollRight"
      | "toggleEngine" | "openMap" | "warp" | "toggleExit" | "toggleCamera"
      | "walkForward" | "walkBack" | "walkLeft" | "walkRight" | "jump";
    const DEFAULT_BINDINGS: Record<string, Intent>; // KeyboardEvent.code -> Intent
    ```
    Mapping (per the spec's control scheme): `KeyW`→throttleUp, `KeyS`→throttleDown,
    `ArrowUp`→pitchUp, `ArrowDown`→pitchDown, `KeyA`→yawLeft, `KeyD`→yawRight,
    `KeyQ`→rollLeft, `KeyE`→rollRight, `Space`→toggleEngine, `KeyM`→openMap,
    `KeyJ`→warp, `KeyF`→toggleExit, `KeyC`→toggleCamera. On-foot reuses
    `KeyW/KeyS/KeyA/KeyD`→walkForward/Back/Left/Right and `Space`→jump (the active
    phase decides which interpretation the consumer reads; both intents are tracked).
  - `InputManager.ts`:
    ```ts
    interface InputManager {
      handleKey(code: string, isDown: boolean): void;
      isActive(intent: Intent): boolean;       // held-key intents
      consumePressed(intent: Intent): boolean;  // edge-triggered: true once per press
    }
    function createInputManager(bindings?: Record<string, Intent>): InputManager;
    ```
    `isActive` reflects current held state. `consumePressed` returns true exactly
    once for each key-down edge, then resets (for toggles like map/warp/engine).

  Note: to satisfy both flight (`KeyW`→throttleUp) and on-foot (`KeyW`→walkForward),
  a single physical key maps to BOTH intents being set; `DEFAULT_BINDINGS` cannot be
  a 1:1 `Record`. Implement bindings as `Record<string, Intent[]>` instead — a code
  maps to a list of intents, all toggled together. Update the type accordingly:
  `const DEFAULT_BINDINGS: Record<string, Intent[]>`.

- [ ] **Step 1: Write the failing test `tests/sim/InputManager.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createInputManager } from "../../src/sim/input/InputManager";

describe("InputManager", () => {
  it("tracks held intents via isActive", () => {
    const im = createInputManager();
    expect(im.isActive("throttleUp")).toBe(false);
    im.handleKey("KeyW", true);
    expect(im.isActive("throttleUp")).toBe(true);
    im.handleKey("KeyW", false);
    expect(im.isActive("throttleUp")).toBe(false);
  });

  it("maps one physical key to flight and on-foot intents together", () => {
    const im = createInputManager();
    im.handleKey("KeyW", true);
    expect(im.isActive("throttleUp")).toBe(true);
    expect(im.isActive("walkForward")).toBe(true);
  });

  it("edge-triggers consumePressed once per press", () => {
    const im = createInputManager();
    im.handleKey("KeyM", true);
    expect(im.consumePressed("openMap")).toBe(true);
    expect(im.consumePressed("openMap")).toBe(false); // already consumed
    im.handleKey("KeyM", false);
    im.handleKey("KeyM", true);
    expect(im.consumePressed("openMap")).toBe(true); // new press
  });

  it("maps warp to KeyJ", () => {
    const im = createInputManager();
    im.handleKey("KeyJ", true);
    expect(im.consumePressed("warp")).toBe(true);
  });

  it("ignores unbound keys", () => {
    const im = createInputManager();
    im.handleKey("KeyZ", true);
    expect(im.isActive("throttleUp")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/InputManager.test.ts`
Expected: FAIL — cannot find module `InputManager`.

- [ ] **Step 3: Implement `src/sim/input/bindings.ts`**

```ts
export type Intent =
  | "throttleUp"
  | "throttleDown"
  | "pitchUp"
  | "pitchDown"
  | "yawLeft"
  | "yawRight"
  | "rollLeft"
  | "rollRight"
  | "toggleEngine"
  | "openMap"
  | "warp"
  | "toggleExit"
  | "toggleCamera"
  | "walkForward"
  | "walkBack"
  | "walkLeft"
  | "walkRight"
  | "jump";

export const DEFAULT_BINDINGS: Record<string, Intent[]> = {
  KeyW: ["throttleUp", "walkForward"],
  KeyS: ["throttleDown", "walkBack"],
  KeyA: ["yawLeft", "walkLeft"],
  KeyD: ["yawRight", "walkRight"],
  KeyQ: ["rollLeft"],
  KeyE: ["rollRight"],
  ArrowUp: ["pitchUp"],
  ArrowDown: ["pitchDown"],
  Space: ["toggleEngine", "jump"],
  KeyM: ["openMap"],
  KeyJ: ["warp"],
  KeyF: ["toggleExit"],
  KeyC: ["toggleCamera"],
};
```

- [ ] **Step 4: Implement `src/sim/input/InputManager.ts`**

```ts
import { Intent, DEFAULT_BINDINGS } from "./bindings";

export interface InputManager {
  handleKey(code: string, isDown: boolean): void;
  isActive(intent: Intent): boolean;
  consumePressed(intent: Intent): boolean;
}

export function createInputManager(
  bindings: Record<string, Intent[]> = DEFAULT_BINDINGS,
): InputManager {
  const active = new Set<Intent>();
  const pressed = new Set<Intent>(); // edge-triggered, awaiting consume

  return {
    handleKey(code: string, isDown: boolean): void {
      const intents = bindings[code];
      if (!intents) return;
      for (const intent of intents) {
        if (isDown) {
          if (!active.has(intent)) pressed.add(intent); // rising edge
          active.add(intent);
        } else {
          active.delete(intent);
        }
      }
    },
    isActive(intent: Intent): boolean {
      return active.has(intent);
    },
    consumePressed(intent: Intent): boolean {
      if (pressed.has(intent)) {
        pressed.delete(intent);
        return true;
      }
      return false;
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/sim/InputManager.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit**

```bash
git add src/sim/input/bindings.ts src/sim/input/InputManager.ts tests/sim/InputManager.test.ts
git commit -m "feat: add input bindings and intent manager"
```

---

## Self-Review

**Spec coverage (against the Slice 1 design doc):**
- Real Newtonian gravity per body → Tasks 3, 4 ✓
- Velocity-Verlet fixed-timestep integration → Tasks 5, 8 ✓
- Real surface gravity / escape-velocity feel (radii & masses real) → Tasks 3, 4 ✓
- Compressed distance via single tunable constant → Task 3 (`DISTANCE_SCALE`) ✓
- Exponential atmosphere + drag (Earth yes, Moon no) → Task 7 ✓
- Floating origin preserving relative positions → Task 9 ✓
- State machine (Landed→Launching→InSpace→Descending→LandedMoon→OnFoot) → Task 10 ✓
- Warp drive: auto-orient + safe approach drop-out → Task 11 ✓
- Astronaut 1/6-g walk + jump → Task 12 ✓
- Manual flight possible (spacecraft throttle/thrust/fuel) → Task 6 ✓
- Keyboard input → intent mapping (the spec's bindings) → Task 13 ✓
- *Deferred to Plan B (rendering/playable loop):* Renderer, CameraRig, Cockpit
  instruments, HUD + target/home markers, NavMap UI, landing-detection thresholds
  wired to state transitions, crash/reset, main loop, on-foot rendering. These are
  presentation/integration and are verified by manual playtest, so they live in
  Plan B by design — not gaps.

**Placeholder scan:** none — every code/test step contains complete content.

**Type consistency:** `Vec3`, `Body`, `Spacecraft`, `MotionState`, `Phase`,
`Intent`, `FloatingOrigin`, `TimeControl`, `Astronaut` names and signatures match
across consuming tasks. `DEFAULT_BINDINGS` is `Record<string, Intent[]>`
consistently in Task 13's interface note, implementation, and tests.

---

## Execution Handoff

Plan A is complete. Plan B (Rendering & Playable Loop) will be written as a
separate plan once Plan A is implemented (or now, if you prefer to see both first).
