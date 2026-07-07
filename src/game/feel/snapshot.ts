// src/game/feel/snapshot.ts
// FrameSnapshot: a plain-data digest of "what happened this frame", built
// once per frame right after sim stepping. It's the spine later audio and
// visual-effect phases read from instead of re-deriving state from Game's
// internals — no Three.js types, just primitives and one-shot booleans.
import type { PhaseKind } from "../../sim/GameState";
import type { SlingState } from "../../sim/slingshot";
import type { LsSeqPhase } from "./lightspeedSequence";
import { SKIM_ALT } from "./skim";

export type SlingKind = SlingState["kind"];
export type TouchdownKind = "soft" | "hard" | null;

// Mirrors updateHud's own "high descent rate" heuristic in Game.ts, so a
// later audio/vfx cue fires on exactly the same condition as the HUD text.
export const WARN_VSPEED = -20; // m/s
export const WARN_ALTITUDE = 500; // m

export interface FrameSnapshot {
  phaseKind: PhaseKind;
  slingKind: SlingKind;
  snapped: boolean; // one-shot: perfect sling-release
  cruising: boolean;
  lsBraking: boolean;
  lsSeqPhase: LsSeqPhase;
  tunnel: number;
  flash: number;
  throttle: number;
  speed: number;
  altitude: number;
  atmosphereDensity: number; // 0 (vacuum) .. 1 (surface)
  inSunBubble: boolean;
  warnDescent: boolean;
  engage: boolean; // one-shot: lightspeed cruise motion begins
  touchdownKind: TouchdownKind; // one-shot
  crashed: boolean; // one-shot
  boarded: boolean; // one-shot: stepped back into the ship
  disembarked: boolean; // one-shot: stepped out onto the surface
  jumped: boolean; // one-shot: astronaut jump
  ringCapturedName: string | null;
  breakaway: boolean;
  assistOn: boolean;
  navMapOpen: boolean;
  // Shared UI-pause gate (Task 11): true while the nav map OR the settings
  // panel is open. Game computes this once (its `uiPaused` getter) and feeds
  // it straight through here — this field is never re-derived from
  // navMapOpen internally, so there is exactly one place "is the sim paused"
  // is decided.
  paused: boolean;
  missionElapsed: number;
  // one-shot: this frame is a natural lightspeed arrival (set at the r.done
  // call sites in Game.stepSim's guided/free cruise blocks), never a player
  // abort (toggleLightspeed's dropout path never sets it). Lets audioCues
  // disambiguate warpArrive from warpAbort without guessing from lsSeqPhase.
  arrived: boolean;
}

// One-shot cues Game detects at specific sites during a frame (crash,
// touchdown, board/disembark, jump, a perfect sling release, a natural
// lightspeed arrival) and clears back to idle once the snapshot for that
// frame has been built.
export interface SnapshotCues {
  snapped: boolean;
  touchdownKind: TouchdownKind;
  crashed: boolean;
  boarded: boolean;
  disembarked: boolean;
  jumped: boolean;
  arrived: boolean;
}

export function idleCues(): SnapshotCues {
  return {
    snapped: false,
    touchdownKind: null,
    crashed: false,
    boarded: false,
    disembarked: false,
    jumped: false,
    arrived: false,
  };
}

export interface SnapshotInputs {
  phaseKind: PhaseKind;
  slingKind: SlingKind;
  cruising: boolean;
  lsBraking: boolean;
  lsSeqPhase: LsSeqPhase;
  tunnel: number;
  flash: number;
  engage: boolean;
  throttle: number;
  speed: number;
  altitude: number;
  verticalSpeed: number;
  inSunBubble: boolean;
  ringCapturedName: string | null;
  breakawayHold: number; // seconds W has been held while captured (0 = not attempting)
  assistOn: boolean;
  navMapOpen: boolean;
  // Game's shared uiPaused gate (navmap.isOpen || settings.isOpen) — see the
  // FrameSnapshot.paused doc comment above.
  paused: boolean;
  missionElapsed: number;
  cues: SnapshotCues;
}

export function buildSnapshot(inputs: SnapshotInputs): FrameSnapshot {
  const atmosphereDensity = Math.max(0, Math.min(1, 1 - Math.max(0, inputs.altitude) / SKIM_ALT));
  const warnDescent = inputs.verticalSpeed < WARN_VSPEED && inputs.altitude < WARN_ALTITUDE;
  return {
    phaseKind: inputs.phaseKind,
    slingKind: inputs.slingKind,
    snapped: inputs.cues.snapped,
    cruising: inputs.cruising,
    lsBraking: inputs.lsBraking,
    lsSeqPhase: inputs.lsSeqPhase,
    tunnel: inputs.tunnel,
    flash: inputs.flash,
    throttle: inputs.throttle,
    speed: inputs.speed,
    altitude: inputs.altitude,
    atmosphereDensity,
    inSunBubble: inputs.inSunBubble,
    warnDescent,
    engage: inputs.engage,
    touchdownKind: inputs.cues.touchdownKind,
    crashed: inputs.cues.crashed,
    boarded: inputs.cues.boarded,
    disembarked: inputs.cues.disembarked,
    jumped: inputs.cues.jumped,
    arrived: inputs.cues.arrived,
    ringCapturedName: inputs.ringCapturedName,
    breakaway: inputs.breakawayHold > 0,
    assistOn: inputs.assistOn,
    navMapOpen: inputs.navMapOpen,
    paused: inputs.paused,
    missionElapsed: inputs.missionElapsed,
  };
}

// Resting state before the first real frame has run.
export function idleSnapshot(): FrameSnapshot {
  return buildSnapshot({
    phaseKind: "landed",
    slingKind: "none",
    cruising: false,
    lsBraking: false,
    lsSeqPhase: "idle",
    tunnel: 0,
    flash: 0,
    engage: false,
    throttle: 0,
    speed: 0,
    altitude: 0,
    verticalSpeed: 0,
    inSunBubble: false,
    ringCapturedName: null,
    breakawayHold: 0,
    assistOn: false,
    navMapOpen: false,
    paused: false,
    missionElapsed: 0,
    cues: idleCues(),
  });
}
