# Galaxy Spaceship Simulator — Slice 1 Design

**Date:** 2026-06-19
**Status:** Approved design, pre-implementation
**Scope:** First vertical slice of a larger browser-based Milky Way spaceship simulator

---

## Vision (the long game)

A browser-playable spaceship simulator set in the Milky Way: take off and land
vertically on real planets with their true gravity and atmospheric properties,
fly between stars, moons, and planets, descend through atmospheres to land, exit
the ship in a spacesuit to explore on foot, and eventually build out procedural
environments and lifeforms.

This is a multi-year-scale vision spanning several independent subsystems. It is
**not** specced as one project. This document specs only the **first vertical
slice** — a small but complete, satisfying loop. Later subsystems (atmospheric
entry on other worlds, procedural terrain, lifeforms, additional star systems,
etc.) each get their own spec → plan → implementation cycle.

## Slice 1 — one-line summary

> Launch a ship vertically off Earth against real gravity, open a nav map and
> either fly manually (a few minutes) or lightspeed-warp to the Moon, retro-burn
> down to a controlled airless landing, then step out in a spacesuit and moonwalk
> in 1/6 gravity to look back at your lander.

The emotional core is **the arrival moment** (descent + touchdown), with **flight
feel** as the supporting priority.

---

## Design decisions (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Top priority | The arrival moment, then flight feel | Spend fidelity budget on descent + touchdown |
| Realism model | Real **physics** constants, **compressed** distances | Each world feels distinct to land on; travel stays playable |
| First pairing | **Earth → Moon** | Dramatic launch (thick atmo, strong g) + simple airless landing |
| First arrival type | **Airless** (Moon) | Buildable first landing; atmospheric entry is a later slice |
| Viewpoint | **First-person cockpit** (primary); third-person toggle later | Stated immersion goal |
| Slice end point | **First steps on the Moon** | Stepping out + looking back is the arrival's payoff |
| Art direction | **Stylized realism** | Believable, performant in-browser, art-consistent |
| Controls | **Keyboard + mouse** | Universal, zero setup; gamepad is a later add |
| Tech stack | **Three.js + thin custom physics/scale layer** | Full control over space-sim behaviors; lean and testable |
| Travel | **Manual flight (2–5 min)** OR **auto-travel time-warp** (<10s) | Anti-boredom + anti-lost; both use the same real physics |
| Navigation | **Nav map + persistent target/home markers** | "You can never get lost" insurance |

---

## Architecture & module breakdown

Principle: small, single-purpose modules with clear interfaces, each
understandable and testable in isolation. Data flows one direction per frame.

### Core engine layer
- **`Renderer`** — wraps Three.js (scene, camera, lighting, render loop). Knows
  nothing about gameplay.
- **`FloatingOrigin`** — keeps the active camera near (0,0,0) and shifts all world
  objects when drift exceeds a threshold. The linchpin for stable huge distances.
- **`TimeControl`** — fixed-timestep simulation clock + optional time-warp.

### Simulation layer
- **`Physics`** — Newtonian gravity + thrust integrator (Velocity-Verlet, fixed
  timestep). Pure math, no rendering. Fully unit-testable.
- **`Body`** — celestial body data: mass, radius, surface gravity, atmosphere
  params, position. Driven by a real-data table (Earth has atmosphere; Moon does
  not). New worlds are new rows of data.
- **`Spacecraft`** — player vessel: mass, fuel, thrust, orientation, state.
- **`Astronaut`** — on-foot state: position, 1/6-g walk physics, exit/enter ship.

### Game layer
- **`GameState`** — state machine: `Landed(Earth) → Launching → InSpace →
  Descending → Landed(Moon) → OnFoot`. Each state owns its controls + camera.
- **`InputManager`** — maps keyboard/mouse to intent ("thrust up", "pitch",
  "look"), decoupled from what the intent does. Bindings live in one config.
- **`CameraRig`** — first-person cockpit view + landing/down-view; structured so
  the third-person toggle drops in later.
- **`NavMap`** — openable overhead schematic of the Earth–Moon system showing the
  player, trajectory, distances, and clickable targets.
- **`WarpDrive`** — auto-orients to the selected target and fast-forwards the sim
  to a safe approach distance.

### Presentation layer
- **`Cockpit`** — 3D cockpit model + functional instrument readouts.
- **`HUD`** — 2D overlay for always-visible essentials + target/home markers.
- **`Assets`** — loads/caches models and textures.

### Per-frame data flow
```
Input → GameState → Physics (fixed sim step) → world updated
      → FloatingOrigin rebases → Renderer draws
      → Cockpit/HUD read sim state to display
```
The simulation never reads from rendering, so physics runs and tests headless.

---

## Physics & the scale problem

**Gravity & flight.** Every `Body` exerts real Newtonian gravity
(`F = G·m₁·m₂/r²`) using actual masses and radii. The ship integrates with
**Velocity-Verlet at a fixed timestep** (stable, energy-conserving,
deterministic, testable). Real values mean Earth's ~9.8 m/s² genuinely fights the
launch and the Moon's ~1.6 m/s² makes a slow, floaty descent — each world feels
distinct for free.

**Atmosphere.** Earth gets an exponential-density atmosphere applying drag (and a
visible entry effect in a later slice); the Moon has none. Modeled as per-body
parameters so adding Mars later is just data.

**Compression rule.** Real *physics constants*, but the empty-space *gap* between
Earth and Moon is shrunk via a single tuning constant **`DISTANCE_SCALE`**.
Surface gravity, escape velocity, and landing feel stay real; only the empty
distance is scaled. Tuning target:
- **Manual** Earth→Moon: ~**2–5 minutes** of active piloting (accelerate, coast,
  flip, retro-burn).
- **Warp** Earth→Moon: under ~**10 seconds**.
Both paths use identical real physics — manual is the player doing the burns,
warp is the sim fast-forwarding them. Exact numbers tuned in playtest.

**Precision & floating origin.** 32-bit floats jitter far from origin. The
player/camera stays at universe center; `FloatingOrigin` shifts all other objects
when the player exceeds a threshold. Positions are stored in high-precision
"universe" coordinates; render positions are always relative to the player.

**Collision / landing (slice 1, simplified).** Ground is the body's sphere
surface plus a flat landing pad. Touchdown = altitude ≈ 0 with vertical speed and
tilt under safe thresholds → "landed". Too fast or too tilted → soft crash. Full
terrain collision is a later slice.

---

## Gameplay loop & states

1. **Landed (Earth)** — Start in the cockpit on a launch pad, engines off,
   systems readable. Press to ignite.
2. **Launching** — Vertical thrust against Earth's full gravity; needs real
   throttle to break free. HUD shows altitude, velocity, fuel burn. Atmosphere
   thins with altitude.
3. **In Space** — Weightless coast. Open `NavMap`, select the Moon, then either
   fly manually toward it or hit **Warp** (auto-orient, star streak, fast-forward
   to a safe approach distance).
4. **Descending** — Falling under the Moon's real 1/6 gravity. No atmosphere →
   pure thrust management via a controlled retro-burn. **The arrival moment.**
   Down-view camera + landing markers help judge it. HUD shows altitude,
   vertical/horizontal speed, tilt.
5. **Landed (Moon)** — Touchdown within safe speed + tilt thresholds. Engines
   settle, small dust effect, a quiet "you made it" beat. Exit option appears.
6. **On Foot** — Exit the airlock into a spacesuit. Walk in 1/6 gravity (bouncy,
   low-friction moonwalk), turn around, and see the lander standing behind you
   against the black sky and distant Earth. **The payoff.**

**Fail/reset.** Bad landing (too fast/tilted) = soft crash → quick reset to the
Earth pad (or a Moon-approach checkpoint — decided later). No scores or
penalties; this slice is about the journey.

Full loop: *ignite → climb → travel (manual or warp) → retro-burn down → touch
down → step out → look back.*

---

## Cockpit, controls & UI

**Cockpit (immersion goal).** First-person 3D cockpit model wraps the view:
window frame, dashboard with functional instruments, implied seat. Stylized
realism. Instruments read live sim data:
- Altimeter (height above the body below)
- Velocity / vertical-speed indicator (+ horizontal speed for landing)
- Attitude indicator (tilt vs. local "down" — critical for safe touchdown)
- Fuel gauge
- Throttle readout

**HUD overlay (safety net).** Always-visible essentials: selected-target marker +
distance, prograde/retrograde markers, altitude/speed, warnings (e.g. "HIGH
DESCENT RATE"). Cockpit instruments = immersion; HUD = safety net. Target + home
markers persist even when the body is off-screen, so the player cannot get lost.

**Controls (keyboard + mouse, remappable via one config).**
- **Mouse** — look around cockpit / aim view
- **W/S or Shift/Ctrl** — main engine throttle up/down
- **A/D, Q/E** — attitude (pitch/yaw/roll) via RCS
- **Spacebar** — toggle/hold main engine (tuned in playtest)
- **M** — open NavMap
- **J** — warp (when target selected and safe)
- **F** — exit/enter ship (when landed)
- **WASD** — walk (On-Foot state)
- **C** — camera / down-view toggle

**NavMap UI.** Opening pauses into a clean overhead schematic of the Earth–Moon
system (player, trajectory, distances, clickable targets). Close to return.

---

## Tooling & testing

**Setup:** Vite (dev server + bundling), TypeScript (catches math/state bugs),
Three.js (rendering), Vitest (unit tests).

**Testing strategy** — the architecture keeps the important logic testable
headless:
- `Physics` — known-value unit tests: stable orbit stays in orbit; surface
  gravity matches real m/s²; Verlet conserves energy over N steps; escape
  velocity behaves.
- `FloatingOrigin` — rebasing preserves relative positions exactly (no drift).
- `GameState` — valid/invalid transitions (e.g. can't go OnFoot unless Landed).
- `WarpDrive` — drops out at the correct safe approach distance for a target.
- Rendering / cockpit / feel — validated by **manual playtest**, not automated.
  The build will run so it can be flown and tuned by hand.

---

## Out of scope for Slice 1 (YAGNI — each becomes a later spec)

- Mars / atmospheric entry, gas-giant moons, other star systems
- Procedural terrain, biomes, lifeforms/creatures
- Third-person camera, gamepad support
- Resource/survival systems, scoring, missions
- Multiplayer, saving/loading

Keeping these out is what makes the first slice finishable.
