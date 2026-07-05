import { idleSling, type SlingState } from "../sim/slingshot";
import { idleSeq, type LsSeq } from "./feel/lightspeedSequence";

export interface PadResetState {
  sling: SlingState;
  slingHeldPrev: boolean;
  cruising: boolean;
  lsTargetName: string | null;
  lsBraking: boolean;
  lsSeq: LsSeq;
}

// State a crash reset must scrub: anything that can move the ship on its own.
// A still-captured sling rail owns the ship's position and would drag the
// freshly reset ship straight back across the map to the old swing center.
export function padReset(): PadResetState {
  return {
    sling: idleSling(),
    slingHeldPrev: false,
    cruising: false,
    lsTargetName: null,
    lsBraking: false,
    lsSeq: idleSeq(),
  };
}
