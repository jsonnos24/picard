# Picard — The Juice Pass (Design)

**Date:** 2026-06-21
**Status:** Approved design, ready for implementation plan
**Builds on:** Slice 1 (Earth → Moon playable loop), already merged to `main`.

## Intent

Evolve the realistic Earth → Moon simulator into **a joyful thrill ride through
space at speeds humans aren't yet capable of**. The flight itself *becomes* the
ride. Realism stays the substrate, but the felt experience is now velocity, flow,
proximity, and an explosive warp leap.

**Handling philosophy:** *Feel wins, keep it plausible* (arcade-sim). Bend physics
toward exhilaration — punchier thrust, swoopy responsive control, generous assists —
but keep it grounded enough to still read as real spaceflight.

This is the **foundation pass**: a cohesive set of feel/sensory systems applied
across the whole journey. All four thrill sources (rush of speed, freedom & flow,
skimming & proximity, the warp leap) share the same underlying machinery — a
camera rig that reacts to speed, handling that feels alive, and particle systems
that scale with velocity. A later pass can author deliberate ride *pacing* on top
of this foundation.

## Architecture

The codebase already separates **pure logic** (`sim/`, `game/`) from **render/feel**
(`render/`, `ui/`). The Juice Pass respects that split:

- **Feel-math is pure and unit-tested** — lives in `game/`, mirrors the existing
  64-test sim core. Functions like `fovForSpeed(speed)`, angular-velocity easing,
  `skimIntensity(altitude, speed)`, and the warp-sequence phase machine.
- **Three.js wiring lives in `render/`** — `CameraRig`, `speedDust`, `warpEffect`
  consume the feel-math. Verified by manual playtest.

No new runtime dependencies. Audio is explicitly **deferred** to a later pass.

## System 1 — Arcade-sim handling

Goal: the craft feels *alive in your hands* without breaking plausibility.

- **Momentum on rotation.** Replace today's instant-on turning (`ROT_RATE = 0.6`,
  no easing in `attitude.ts`) with an angular-velocity model that ramps up and eases
  out — you lean into a turn and it settles when released. New pure function tracking
  angular velocity toward a target with accel + decay constants. Reads as real RCS
  authority, just smoother.
- **Punchier thrust.** More acceleration kick so speed builds excitingly. Retune from
  the current realistic 2–5 min hand-flown Earth → Moon toward a snappy **~60–90 second**
  cruise (still warp-skippable), staying plausible.
- **Light assist.** Optional gentle rotational damping so the craft feels *controlled*,
  never twitchy and never fighting the player. Kept minimal (YAGNI).

**Accepted trade-off:** punchier thrust + momentum turning make the precise, deliberate
landing of today softer and swoopier. That is intended — it is the thrill-ride feel.

## System 2 — Speed-sensation camera rig

The biggest "feel fast" lever, and cheap. Builds on the existing `CameraRig` and
`speedDust`. Nothing here touches physics.

- **Speed → FOV.** Widen field-of-view with velocity: ~60° at rest stretching toward
  ~95° at high speed, eased so it breathes rather than snaps. Pure `fovForSpeed(speed)`
  (testable); `CameraRig` applies it to the `PerspectiveCamera`.
- **Acceleration shake & sway.** Subtle positional camera judder that grows with thrust
  and speed (a "barely contained" rattle), plus a small g-lean: the cockpit camera leans
  slightly opposite to the turn, driven by System 1's angular velocity, so the craft
  feels like it has mass. Tiny offsets layered onto the existing cockpit transform;
  dialable.
- **Intensified motion field.** Push `speedDust` further: at high speed points **stretch
  into streaks**, brighten, and the current 0.55 opacity cap rises so the galaxy
  genuinely rushes by. Optional soft edge-vignette to frame the rush.

Keyed off current speed and acceleration. Pure feel-math (`fovForSpeed`, shake/lean
envelopes) is unit-tested; Three.js application is playtested.

## System 3 — Reactive juice: warp leap + skim

### The warp leap

Today the warp is an instant teleport (`warpTo`) behind a one-frame opacity flash
(`warpEffect`, which the code itself flags "replace with a streak shader later"). Turn
it into an **event** — a short cinematic wrapping the existing teleport, driven by a
pure phase machine (`charge → release → settle`) that the render layer reads:

- **Charge** (~1s): FOV pulls *in*, the speed-dust field converges inward, tension builds.
- **Release**: FOV slams wide, dust becomes a blinding forward streak-tunnel, screen
  blooms white. The teleport executes at this peak — the moment of crossing into
  superhuman speed.
- **Settle**: the tunnel collapses to stars, FOV eases back, view recenters on the new
  heading (existing `resetLook`). Arrive breathless.

The sim is unchanged — the teleport still happens, it is simply no longer a blink.

### The skim

When low over a surface *and* moving fast (using the existing `primaryBody` altitude),
the juice intensifies: speed-streaks lengthen, shake tightens, surface-rush dust kicks
up. Screaming low over the Moon becomes a deliberate thrill instead of a hazard. Pure
`skimIntensity(altitude, speed)` feeding the render layer.

## Deferred (not this pass)

- **Audio.** A small dependency-free Web Audio module (velocity-pitched engine hum, warp
  charge/whoosh, surface-rush wind) would roughly double the visceral impact. Cleanly
  separable; its own follow-on pass.
- **Authored ride pacing** (launch blast → speed corridor → warp → skim → swoop landing
  as deliberately paced beats). Builds on this foundation later.

## Testing

Mirrors the existing approach:

- **Unit-tested (Vitest):** all pure feel-math — `fovForSpeed`, angular-velocity easing,
  `skimIntensity`, and the warp phase machine (phase transitions, durations, teleport-at-peak).
- **Playtested:** Three.js wiring and overall *feel*, with explicit tuning passes, since
  "joyful" is a felt target rather than an assertable one.

## Tunables (playtest-set)

Thrust/acceleration magnitude, target cruise time (~60–90s), rotation accel/decay,
FOV range (~60–95°), shake/sway amplitude, streak length & opacity cap, warp phase
durations, skim altitude/speed thresholds.
