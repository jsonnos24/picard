// src/game/feel/audioCues.ts
// Pure edge detector: diffs consecutive FrameSnapshots into one-shot audio
// cues. Never touches DOM/WebAudio — a later director module maps each Cue
// to a sound. Every cue fires on the frame a condition BECOMES true (or the
// one-shot field is set that frame); it never repeats while the condition
// simply holds.
import type { FrameSnapshot } from "./snapshot";

export type Cue =
  | "launchClear"
  | "ringCapture"
  | "swingHoldStart"
  | "release"
  | "releasePerfect"
  | "breakaway"
  | "warpChargeStart"
  | "warpEngage"
  | "warpArrive"
  | "warpAbort"
  | "touchdownSoft"
  | "touchdownHard"
  | "crash"
  | "sunRepel"
  | "warnHeatStart"
  | "warnHeatStop"
  | "warnDescentStart"
  | "warnDescentStop"
  | "board"
  | "disembark"
  | "jump"
  | "uiNavOpen"
  | "uiNavClose";

export function audioCues(prev: FrameSnapshot | null, cur: FrameSnapshot): Cue[] {
  // No prior frame to diff against: emit nothing, even if cur happens to
  // carry a one-shot flag (e.g. the very first snapshot after a save load).
  if (prev === null) return [];

  const cues: Cue[] = [];

  if (prev.phaseKind === "landed" && cur.phaseKind === "launching") {
    cues.push("launchClear");
  }

  if (prev.ringCapturedName === null && cur.ringCapturedName !== null) {
    cues.push("ringCapture");
  }

  // SlingKind is only "none" | "captured" | "released" — there's no separate
  // winding/hold field on the real snapshot, so per the brief's documented
  // fallback we fire swingHoldStart on entry into "captured" itself.
  if (prev.slingKind !== "captured" && cur.slingKind === "captured") {
    cues.push("swingHoldStart");
  }

  if (prev.slingKind === "captured" && cur.slingKind === "released") {
    // releasePerfect suppresses the plain release cue on the same edge.
    if (cur.snapped) cues.push("releasePerfect");
    else cues.push("release");
  }

  if (!prev.breakaway && cur.breakaway) {
    cues.push("breakaway");
  }

  if (prev.lsSeqPhase !== "charge" && cur.lsSeqPhase === "charge") {
    cues.push("warpChargeStart");
  }

  if (cur.engage) {
    cues.push("warpEngage");
  }

  if (prev.cruising && !cur.cruising) {
    // cur.arrived is a hard signal, not a heuristic: Game sets it only at the
    // natural-arrival call sites (the r.done handling in the guided/free
    // cruise blocks in stepSim), never on the player-cancelled abort path
    // (toggleLightspeed's dropout branch). See snapshot.ts's SnapshotCues.
    cues.push(cur.arrived ? "warpArrive" : "warpAbort");
  }

  if (!prev.inSunBubble && cur.inSunBubble) {
    // Same edge drives two distinct sounds (a warning tone and a repel stinger).
    cues.push("warnHeatStart");
    cues.push("sunRepel");
  }
  if (prev.inSunBubble && !cur.inSunBubble) {
    cues.push("warnHeatStop");
  }

  if (!prev.warnDescent && cur.warnDescent) {
    cues.push("warnDescentStart");
  }
  if (prev.warnDescent && !cur.warnDescent) {
    cues.push("warnDescentStop");
  }

  if (cur.touchdownKind === "soft") cues.push("touchdownSoft");
  if (cur.touchdownKind === "hard") cues.push("touchdownHard");
  if (cur.crashed) cues.push("crash");
  if (cur.boarded) cues.push("board");
  if (cur.disembarked) cues.push("disembark");
  if (cur.jumped) cues.push("jump");

  if (!prev.navMapOpen && cur.navMapOpen) cues.push("uiNavOpen");
  if (prev.navMapOpen && !cur.navMapOpen) cues.push("uiNavClose");

  return cues;
}
