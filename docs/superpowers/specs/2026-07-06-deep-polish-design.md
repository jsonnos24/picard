# Picard — Deep Polish Milestone

## Context

Picard (the cartoon toy-scale solar-system explorer) has a complete, working core loop — launch → lightspeed → slingshot → land → walk — with 245 passing tests and a mature camera/feel layer. But it presents like a prototype: **the game is completely silent**, planets are flat untextured spheres on a navy void, the ship has no engine flame, the UI is Courier-New programmer-art with zero animation, first load is a blank black screen, and touch players get no textual guidance at all. The user wants a deep, multi-session polish milestone across four areas: **sound & music, visual feel, UI & onboarding, mobile & robustness**.

Decisions locked with the user: the game is officially named **Picard**; audio is **procedural WebAudio with both SFX and a generative ambient music bed** (no downloaded assets — ever; textures are canvas-generated, favicon is inline SVG).

Architecture rules (from the existing codebase, must hold throughout):
- Layering: `sim/` pure physics → `game/` orchestration + `game/feel/` pure logic → `render/` Three.js glue → `ui/` DOM. All new logic lands in small pure, parameterized modules with Vitest tests (models: `src/game/phases.ts`, `src/game/feel/*`). `Game.ts` stays an untested orchestrator.
- Vitest runs in node — anything touching DOM/canvas/AudioContext stays in thin untested glue.
- End-to-end verification via the **`verify` skill**: headless Chrome driving `window.__game.frame(t)` with synthetic timestamps + KeyboardEvents. Invariants: `window.__game` stays exposed; no code path may require a user gesture; AudioContext ops must never throw while suspended; the splash must be a cosmetic overlay over an already-constructed game (never a boot gate).
- Three.js is **r0.169** (verified): addons via `three/examples/jsm/...`; `NeutralToneMapping`/`OutputPass` exist; default outputColorSpace already sRGB; custom ShaderMaterials **must include the `logdepthbuf` shader chunks** (renderer uses logarithmicDepthBuffer) or they z-fight — the #1 trap in Phase C.
- Esc is unbound in `src/sim/input/bindings.ts` (verified) — free for UI use.

Each phase ends green (`npm test`, `npm run build`, verify-skill pass) and is committed separately. Phase order A → B → C → D → E → F (B and C are independent; D needs A; E wires B's settings; F certifies).

Step 0: write the design spec to `docs/superpowers/specs/2026-07-06-deep-polish-design.md` (project convention) and commit it.

---

## Phase A — Foundation: robustness fixes, renderer hygiene, tone mapping, FrameSnapshot

1. **resetToPad leaks** (`src/game/Game.ts:715-739`): extend `src/game/padReset.ts` (pure) to also clear `lsGraceUntil` and transient brake/breakaway/notice state; keep `missionElapsed` across crashes (mission clock, not attempt clock); call `rig.resetLook()`. Extend `tests/game/padReset.test.ts`.
2. **Un-validated phase write** (`Game.ts:305` raw `this.phase = {kind:"space"}` during swing): route through `transition()` from `src/sim/GameState.ts`; fix the ALLOWED table if needed, with test.
3. **`selectPrimaryBody` called ~5×/frame**: compute once per frame into a field, thread to consumers.
4. **`Renderer.resize()` doesn't re-apply pixel ratio** (`src/render/Renderer.ts:20-26`): add `setPixelRatio(Math.min(devicePixelRatio, this.dprCap))`; introduce `dprCap` field (used by E's quality setting).
5. **Tone mapping**: `ACESFilmicToneMapping`, exposure ~1.15. Known risk: ACES muddies flat toon colors — mitigation ladder: (1) retune palette saturation in `bodies.ts`/`ship.ts` (~10-15%), (2) fall back to `NeutralToneMapping`, (3) revert to none and rely on D's fake-bloom sprites. Explicit before/after screenshot checkpoint via verify skill.
6. **`FrameSnapshot`** — the spine of B–D. New pure `src/game/feel/snapshot.ts`: plain-data snapshot (phase, sling state, snapped, cruising, lsSeqPhase, tunnel/flash, throttle, speed, altitude, atmosphereDensity, inSunBubble, warnings, one-shot flags engage/touchdownKind/crashed/boarded/jumped, navMapOpen/paused, missionElapsed) + `buildSnapshot()`. `Game.frame` builds one per frame and keeps `prevSnapshot`. Tests: field mapping, one-shots clear next frame.
7. `main.ts:8`: replace the "TODO: remove" on `window.__game` with a comment that the verify skill requires it.

**Verify:** full loop incl. crash→reset→relaunch (warp immediately after crash must charge normally — proves the lsGrace leak is fixed); tone-mapping screenshots.

## Phase B — Audio: cues, layers, synth patches, music bed, mute, visibility

**Pure logic (tested, in `src/game/feel/`):**
- `audioCues.ts` — `audioCues(prev, cur) → Cue[]` edge detector. Cues: launchClear, ringCapture, swingHoldStart, release, releasePerfect (suppresses plain release), breakaway, warpChargeStart, warpEngage, warpArrive, warpAbort, touchdownSoft/Hard, crash, sunRepel, warnHeatStart/Stop, warnDescentStart/Stop, board, disembark, jump, uiNavOpen/Close, uiClick. Edges only, no repeats while held. (~25 tests.)
- `audioLevels.ts` — `audioLevels(cur) → Levels`: engine (`throttle^0.7` + pitch hint), wind (`atmosphereDensity·speed` clamped), warpBed (tunnel), rumble (accel/capture), danger (warnings active); attack/release smoothing constants as data. (~12 tests.)
- `musicBed.ts` + `prng.ts` (mulberry32) — generative sequencer `musicStep(state, dtBeats, mood) → {state, events}`; mood from snapshot (landed→calm, space→drift, cruise→wonder, warning→tense); pentatonic/add9 chord pools; deterministic. (~8 tests.)

**WebAudio glue (untested, new `src/audio/`):**
- `AudioDirector.ts` — only file touching AudioContext. Lazy context; `resume()` on first real pointerdown/keydown; every method no-ops when suspended/missing (headless-safe); graph: master gain → compressor → destination with sfx/layers/music buses. API: `frame(cues, levels, dt)`, `setMuted`, `setMusicEnabled`, `setMasterVolume`, `suspendForBackground()/resumeFromBackground()`. **Debug ring buffer of last 50 cues + levels exposed as `__game`-reachable `audioDebug()`** — how verify asserts audio without sound.
- `patches.ts` — one synth patch per cue (concrete starting recipes in the design spec: noise-buffer launch rumble, two-partial capture pluck, triangle-arpeggio perfect release, saw-sweep warp charge, filtered-noise engage thump, sine pitch-drop touchdowns, waveshaper crash, 2 Hz alarm beeps, short UI blips).
- `layers.ts` — persistent nodes: detuned-saw engine, pink-noise wind through bandpass, warp drone, danger beep loop; gains lerped toward Levels targets.
- `music.ts` — voice pool (triangle/sine, long envelopes, feedback delay ~0.35s) consuming musicBed NoteEvents on a beat clock.

**Wiring & persistence:**
- `Game.frame`: build snapshot → `audio.frame(audioCues(prev,snap), audioLevels(snap), dt)` (~3 lines).
- `visibilitychange` handler in `main.ts` → suspend/resume audio (sim already safe via dt clamp).
- Pure `src/game/settings.ts` — `loadSettings/serializeSettings`, defaults `{muted:false, musicEnabled:true, sfxVolume:1, quality:"auto"}`, localStorage key `picard.settings.v1`, corrupt-JSON tolerant (~6 tests). localStorage glue stays 2 lines in ui.
- Minimal mute toggle button now (`src/ui/MuteButton.ts`); full settings panel comes in E.

**Verify:** headless full loop asserting `audioDebug()` cue sequence `launchClear → warpChargeStart → warpEngage → warpArrive → ringCapture → release* → touchdown*`; zero throws with suspended context. Manual browser session for sound tuning (all constants exported).

## Phase C — Visual juice wave 1: starfield, planet character, Sun

- **Starfield**: pure `src/game/feel/starfieldSpec.ts` (seeded star positions/sizes/color-indices/twinkle phases; 4 flat tints; milky-way band of ~1500 extra stars along a tilted great circle; ~6 tests) + ShaderMaterial points in `bodies.ts` (per-star size, twinkle on medium/large only; **must include logdepthbuf chunks**). Optional: 3-4 huge low-alpha additive nebula sprites along the band.
- **Planet surfaces**: pure `src/game/feel/planetSurface.ts` — per-body descriptors (banded Jupiter/Saturn, continent-blob Earth + polar caps, splotched Mars, cratered Mercury/Moon, subtle-band ice giants; ~8 tests) + `src/render/scene/planetTexture.ts` painting specs onto 512×256 equirect canvases with **hard-edged flat fills** (toon — no gradients; 1px wrap duplication against seams), applied as `MeshToonMaterial.map`.
- **Rotation**: per-body cartoon `spinRate` applied to the sphere mesh only (render-only; sim never reads mesh transforms — confirm pads are sim-side before landing this).
- **Atmosphere fresnel rim**: `src/render/scene/atmosphereRim.ts` BackSide shell, rim alpha **quantized to 2 steps** (cel-consistent), additive, per-body tint, only on bodies with atmosphere. Fallback if the log-depth shader fights: inverted-hull mesh with vertex alpha.
- **Saturn ring**: canvas radial-stripe texture (4-5 flat tones + transparent gaps) replacing the flat disc.
- **Sun**: 2-3 layered additive glow sprites (hot core / mid / wide) with slow independent scale wobble + flat triangle flare spikes counter-rotating.

**Verify:** screenshots at Earth orbit (continents/caps/rim), Saturn approach (bands), near-Sun (corona, no z-fighting), deep space (star variance + band); frame-time spot check.

## Phase D — Visual juice wave 2: exhaust, dust, shadow, chase shake, bloom

- **Engine exhaust**: pure `src/game/feel/exhaust.ts` (length lags throttle — attack 0.08s / release 0.25s, seeded flicker, trail emission; ~8 tests) + `src/render/scene/exhaust.ts`: two-cone cartoon flame (flat orange inside flat yellow, hard edges, Ghibli-fire style) at the tail + ~60-segment fading trail (reuse `speedDust.ts` technique). Driven from snapshot throttle.
- **Landing dust overhaul**: rewrite `src/render/scene/dust.ts` keeping the `puff(at)` API — 40-60 billboarded flat-color puff sprites with radial velocity/drag/shrink + the classic expanding cartoon shock ring; kinematics pure in `src/game/feel/puff.ts` (~6 tests). Intensity by touchdownKind; also fires on crash.
- **Contact shadow**: `src/render/scene/contactShadow.ts` — flat dark circle sprite on the surface below ship/astronaut, opacity fading to zero by ~40m altitude, surface-normal aligned; shown in landed/launching/descending/onFoot.
- **Chase-cam shake**: extend `src/game/feel/shake.ts` (already pure+tested) with a chase profile at ~0.35× cockpit amplitude — sources: high throttle, atmosphere entry, warp burst, touchdown impulse (~5 tests). Chase currently gets zero shake.
- **Bloom decision (time-boxed spike)**: try real bloom — `EffectComposer` + `RenderPass` + `UnrealBloomPass(strength .55, radius .4, threshold .85)` + `OutputPass`, explicit HalfFloat render target with `samples: 4` (restores MSAA). Log-depth is safe here (bloom never reads depth). `resize()` must setSize the composer. **Accept criterion:** <16ms frame in worst case (warp cruise) under DevTools 6× CPU throttle at DPR 2. **Fallback:** fake bloom via additive glow sprites (Sun already has them; add to exhaust + warp flash), no composer. Wire to the `quality` setting via pure `src/game/feel/quality.ts` heuristic (auto/high/low; ~4 tests).

**Verify:** launch (exhaust + shrinking pad shadow), hard landing (puff + ring), warp engage (bloomed flash), sling swing (shake present, streaks legible); record perf numbers for the bloom decision in the commit message.

## Phase E — UI & onboarding overhaul

- **Branding**: `src/branding.ts` exporting `GAME_NAME = "PICARD"` used by title/splash/manifest/HUD. `package.json` name → `picard`.
- **Visual identity** (`ui.css` + HUD): system font stacks only (ui-monospace telemetry / heavy system-ui display); one accent family — warm cream/amber `#ffd98a` on ink-navy panels `rgba(7,11,24,.82)`, danger = ship red (kills the clashing green border); rounded 10px cartoon panels; 120-180ms ease-out transitions on HUD row show/hide, notice slide-in, warning pulse, marker pop; `prefers-reduced-motion` respected; keep the textContent-on-change perf pattern (CSS class toggles only).
- **Nav map UX** (`NavMap.ts`): × button + Esc + click-outside to close; "tap"/"click" wording via `matchMedia(pointer)`; selected-body info strip (name, type, distance, lightspeed ETA via `etaSeconds` from `sim/lightspeed.ts`, surface gravity) + SET COURSE button; "PAUSED" chip while open. Pure formatting helpers in `src/ui/format.ts` (~5 tests).
- **Desktop context chip** (`src/ui/ContextChip.ts`): bottom-center chip showing the `contextAction` verb + key (`[SPACE] LAND`, `[J] LIGHTSPEED`) — the resolver exists, it's touch-only today; pulse on verb change.
- **Touch thumbstick + onboarding**: visible base-ring/nub stick at the touch anchor while steering (deflection already 80px); 8px dead-zone via pure `src/game/feel/stick.ts` (~5 tests); first-run overlay `src/ui/Onboarding.ts` (pointer-type aware, dismiss on first meaningful input, `picard.onboarded` flag); **stop hiding all textual guidance on touch** — compact one-line hint variant replaces the `display:none` at `ui.css:9-10`.
- **Splash & app identity** (`index.html`, `main.ts`): inline pre-JS splash — PICARD wordmark (CSS-only), tagline, "TAP TO BEGIN" on touch (doubles as the audio-unlock gesture); fades out 300ms when boot completes; **purely cosmetic overlay — the game constructs beneath it immediately so `__game.frame(t)` works with splash visible** (verify-safe). `<title>` → Picard; theme-color meta; inline-SVG-data-URI favicon (navy circle, cream ring, red dot); `public/manifest.webmanifest` (text JSON) + apple metas.
- **Pause/settings panel** (`src/ui/SettingsPanel.ts`): gear button + Esc (priority: settings open → close it; navmap open → close it; else open settings). Opening pauses sim — extract the NavMap pause pattern (`Game.ts:500-503`) into one shared `paused` gate. Contents: mute, SFX volume, music toggle, quality (auto/high/low → bloom + dprCap), reset-to-pad, replay-tutorial. All through the tested `settings.ts`.

**Verify:** navmap close via all three affordances; settings open/pause/resume; splash auto-behavior headless; manual phone-viewport first-run walkthrough (visible stick, context button flow) + desktop chip verbs through a full loop; 320px-width CSS check.

## Phase F — Final robustness sweep, mobile perf, playtest matrix

- **Lightspeed through the Sun** (`src/sim/lightspeed.ts:41`): guided cruise gains an obstacle param — drop out of cruise at the Sun's bubble boundary (consistent with free cruise). Point-segment distance check, pure. (~6 tests in `tests/sim/lightspeed.test.ts`.)
- **Breakaway-vs-assist ordering** (`Game.ts:248` vs `264`): decide precedence (recommend: breakaway hold wins while captured), document, test any pure decision that emerges.
- **Allocation reduction**: hoist the ~8 per-frame Vector3 allocations in the onFoot camera block (`Game.ts:526-542`) and the per-half-step accel closure (`Game.ts:360`) to reused instances; before/after heap sample in DevTools.
- **Mobile perf certification**: DevTools 6× throttle + DPR 2-3 (real phone if available) across pad idle / atmosphere descent / warp cruise / sling swing / navmap. Budget ≥50fps throttled, no >100ms hitches, stable heap over 3min (audio nodes not leaking). Tune `quality.ts` auto thresholds, star/trail counts per tier.
- **Full playtest matrix**: scripted verify passes — guided lightspeed to 3 targets incl. a Sun-crossing path; free cruise + abort; capture→hold→perfect release→grace warp; breakaway; soft/hard/crash landings→reset→relaunch; disembark→jump→board; navmap+settings+mute persistence across reload. Manual: desktop and touch full loops with sound; tab background/foreground mid-warp; device rotate; reload mid-mission.

---

## Key files

- **Modify:** `src/game/Game.ts`, `src/render/Renderer.ts`, `src/render/scene/bodies.ts`, `src/render/scene/dust.ts`, `src/game/feel/shake.ts`, `src/game/padReset.ts`, `src/sim/lightspeed.ts`, `src/ui/{ui.css,HUD.ts,NavMap.ts,TouchControls.ts,Controls.ts}`, `index.html`, `src/main.ts`
- **Create (pure, tested):** `src/game/feel/{snapshot,audioCues,audioLevels,musicBed,prng,starfieldSpec,planetSurface,exhaust,puff,quality,stick}.ts`, `src/game/settings.ts`, `src/ui/format.ts`
- **Create (glue, untested):** `src/audio/{AudioDirector,patches,layers,music}.ts`, `src/render/scene/{planetTexture,atmosphereRim,exhaust,contactShadow}.ts`, `src/ui/{MuteButton,ContextChip,Onboarding,SettingsPanel}.ts`, `src/branding.ts`, `public/manifest.webmanifest`

## Verification (whole milestone)

`npm test` (~330+ tests by the end, from 245), `npm run build` (tsc gate), and the verify skill after every phase — headless Chrome at `localhost:5199` driving `window.__game.frame(t)`; audio asserted via the `audioDebug()` cue ring buffer; visuals via screenshots; perf via DevTools throttle. One commit per phase minimum (B and C likely 2-3 commits each: pure logic → glue → wiring).
