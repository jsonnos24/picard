# Point-and-fly lightspeed

**Date:** 2026-07-05 · **Status:** approved (user: "sounds good")

## Problem

J refused to lightspeed until a destination was picked on the nav map. The
user doesn't want to need a destination: "I don't want to need to choose a
destination first."

## Design

**The rule becomes "J always goes."**

- Destination set and elsewhere → today's guided jump (trapezoid profile,
  flyby-point arrival, ETA readout). Unchanged.
- No destination — or the destination is the body you're standing on — → a
  **free jump**: same charge/burst cinematics, then cruise along the ship's
  nose direction.

**A free cruise ends when:**

1. **J tap** — existing dropout: bleed to vDrift, drift.
2. **A gravity bubble lies on the flight ray** — the cruise brakes on
   approach (same trapezoid math as guided flight, applied to the bubble
   entry point) and hands off at the ring edge at vArrive, aimed at the same
   flyby offset guided arrivals use. The ring's inbound capture takes over —
   the normal arrival flow. A transient HUD notice names the body
   ("ENTERING X'S GRAVITY RING").
3. **The Sun's bubble** — same as (2); the existing repel + heat warning
   apply after dropout.

**Details:**

- The bubble you start inside (e.g. Earth's, jumping from the pad) is
  ignored — you're leaving, not arriving.
- Bubbles the ray misses are flown straight past at vMax.
- Mid-cruise steering deflects the nose like guided flight; the deflected
  direction is persistent (you can bend a free cruise onto a planet).
- `jumpDecision`: `pickTarget`/`atTarget` (one day old) are replaced by
  `freeJump`. Captured + no target still returns `jump` (swing escape).
- HUD: free cruise shows "LIGHTSPEED — J to drop out" instead of an ETA.
- Map/guided jumps unchanged; the map is now optional.

## Components

- `src/sim/lightspeed.ts` — new pure `freeCruiseStep(pos, vel, dir, steer,
  dt, obstacles, params)`: ray-vs-bubble scan, trapezoid braking toward the
  nearest bubble entry on the ray, flyby-offset handoff, persistent steer.
  Vitest-covered.
- `src/game/jump.ts` — `freeJump` decision. Vitest-covered.
- `src/game/Game.ts` (glue) — `lsFree` pending flag, engage sets the nose
  direction, free-cruise branch in `stepSim`, arrival notice, HUD hint.

## Testing

TDD for both pure modules; headless end-to-end run (pad → free jump → aim
at a body → auto-dropout → ring capture → land) before push.
