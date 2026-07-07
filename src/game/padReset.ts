import { idleSling, type SlingState } from "../sim/slingshot";
import { idleSeq, type LsSeq } from "./feel/lightspeedSequence";
import { idleBrake, type BrakeState } from "./retroBrake";
import type { Vec3 } from "../sim/Vec3";

export interface PadResetState {
  sling: SlingState;
  slingHeldPrev: boolean;
  cruising: boolean;
  lsTargetName: string | null;
  lsBraking: boolean;
  lsSeq: LsSeq;
  lsFree: boolean;
  lsFreeDir: Vec3 | null;
  lsGraceUntil: number;
  brake: BrakeState;
  preBrakeOrient: Vec3 | null;
  breakHold: number;
  notice: string | null;
  noticeUntil: number;
}

// State a crash reset must scrub: anything that can move the ship on its own,
// or leftover transient timing state from the attempt that just ended. A
// still-captured sling rail owns the ship's position and would drag the
// freshly reset ship straight back across the map to the old swing center;
// a stale lsGraceUntil/brake/notice deadline would otherwise leak into the
// next attempt (an unearned perfect-release chain, a phantom brake flip, a
// notice banner from a trip that just ended in a fireball).
//
// missionElapsed is deliberately NOT here — it's the mission clock, not the
// attempt clock, and keeps counting up across a crash.
export function padReset(): PadResetState {
  return {
    sling: idleSling(),
    slingHeldPrev: false,
    cruising: false,
    lsTargetName: null,
    lsBraking: false,
    lsSeq: idleSeq(),
    lsFree: false,
    lsFreeDir: null,
    lsGraceUntil: -1,
    brake: idleBrake(),
    preBrakeOrient: null,
    breakHold: 0,
    notice: null,
    noticeUntil: -1,
  };
}
