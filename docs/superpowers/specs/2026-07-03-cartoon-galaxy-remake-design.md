# Cartoon Galaxy Remake — Design

**Date:** 2026-07-03
**Status:** Approved design
**Scope:** Remake of the sim into a cartoonish solar-system explorer (evolve in place)

---

## Vision

Turn Picard from an earnest arcade-sim into a **cartoonish solar-system explorer**:
a toy-scale, toon-shaded world where travelling between any two bodies takes about
30 seconds at lightspeed (real flight, not teleport), every planet has a visible
gravity bubble you can swing around and slingshot out of, landing is a tap, and
the whole thing plays one-thumbed on a phone. The Milky Way remains the long-term
vision; the solar system is the first playable world.

## Decisions (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Relation to existing code | Evolve in place | Sim core (Verlet, N-body gravity, floating origin, intent input) already works |
| Slingshot mechanic | Capture ring + aim-and-release | Hammer-throw feel; legible timing-based aiming on touch |
| Art style | Toon-shaded 3D | Cel shading, outlines, saturated colors, chunky planets; reuses renderer |
| World scope | Solar system first | Sun + 8 planets + Earth's Moon; hops ~30 s |
| Arrival | Landing kept, arcade-ified | Tap-to-auto-land (reuses landing assist), brief hop-out walk, tap to launch |
| Mobile controls | One-thumb drag steer + big buttons | Landscape-first; desktop keyboard/mouse keeps working |
| Scale model | Toy scale, hand-tuned | Planets 1.2–20 km radius, distances in hundreds of km; masses derived from desired surface gravity |
| Travel model | Lightspeed = real flight | Trapezoid speed profile, V_MAX 150 km/s, arrives at capture ring at 4 km/s — chains directly into the slingshot |
| Swing model | On-rails circular swing | Toy gravity can't bend a 4 km/s ship; rails are exact, tunable, and fun |
| Bodies | Static (no orbital motion) | Keeps nav and slingshot aiming legible |

## The core loop

Launch → steer/lightspeed toward a target (~30 s) → auto-drop into its gravity
ring at speed → captured into a swing → hold to wind up (hammer throw) → release
to fling (snaps to nav target within ~10°) → chain into lightspeed (perfect
release skips the charge) → or tap-to-land → hop out, walk, look around →
relaunch. The Sun never captures: it repels, with heat warnings and shake.

## Architecture

Existing layering preserved: `sim/` (pure physics + new pure mechanics) →
`game/` (orchestration + feel) → `render/` (Three.js) and `ui/` (DOM). All new
mechanics (`lightspeed.ts`, `slingshot.ts`, `contextAction.ts`, `chase.ts`) are
pure, parameterized modules with Vitest coverage; Three.js/DOM glue stays thin.

Key changes:

- **Bodies** (`sim/Body.ts`): `kind`, `landable`, `captureRadius` (6×radius),
  `color`, optional `rings`; mass derived from target surface gravity; no
  atmospheres.
- **Phases** (`sim/GameState.ts`): structured `{kind, body}` union generalizing
  the Earth/Moon-specific states to any landable body.
- **Lightspeed** (`sim/lightspeed.ts`): replaces `WarpDrive` teleport; trapezoid
  profile with predictive drop at the target's capture ring; slight steering.
- **Slingshot** (`sim/slingshot.ts`): capture → blended entry onto a circular
  rail → hold-to-accelerate swing → tangent release with boost and target snap →
  cooldown. Sun repel helper.
- **Rendering**: `MeshToonMaterial` + shared gradient map + inverted-hull
  outlines (no post-processing — mobile perf); chase camera as default with pure
  framing math; gravity-ring bubbles; PointLight sun.
- **Input**: analog `steerX/steerY` axes + `injectIntent` on `InputManager`;
  `TouchControls` DOM layer (drag steer + context button cluster); Pointer Lock
  gated to fine pointers.
- **UI**: HUD rebuilt on cached elements (no per-frame innerHTML), safe-area
  mobile layout; NavMap becomes a responsive top-down 2D map of all bodies.

## Error handling

- Non-landable bodies (Sun) never enter `descending`; repel prevents contact.
- Predictive segment-vs-sphere checks for lightspeed drop and ring capture — no
  tunneling at any speed.
- Degenerate slingshot entry (radial approach) falls back to a valid swing plane.
- Release cooldown prevents instant recapture; capture requires minimum speed so
  parked ships aren't grabbed.
- Fuel fail-state removed (arcade); crash detection retained.

## Testing

Per the repo's culture: every pure module gets unit tests (capture matrix, plane
orthonormality, trip-time bounds, arrival invariants, release/snap geometry,
context-action verb matrix, axis semantics), plus one cross-module chain
invariant test (lightspeed arrival speed satisfies capture; fling chains). The
render/DOM layer is verified manually per phase; final acceptance is the full
touch-only loop on a real phone.

## Implementation

Six independently shippable phases (see companion plan):
1. Toy solar system + generalized phases + ship retune (+ slingshot math spike)
2. Lightspeed flight (replaces teleport)
3. Capture ring + slingshot wiring + visuals
4. Chase camera + toon look
5. Touch input + responsive UI
6. (Stretch) polish pass
