// Whether the ring-capture scan is allowed to hook the ship this step.
//
// Landing assist (L, or J-at-target) is a sticky toggle — once on, it stays
// on through arrivals at bodies that have nothing to do with the landing in
// progress. Gating the ENTIRE scan behind `!assistOn` (the original bug)
// meant every lightspeed arrival, at any body, sailed through its capture
// ring uncaptured for the rest of the flight once a player had ever landed
// with assist. The protection assist-landing actually needs is narrower:
// don't let the body you're actively assist-landing AT snatch you back into
// orbit mid-descent. Every other arrival — including a fresh cruise hand-off
// at THIS body while still in space, before descent begins — should capture
// exactly as it would with assist off.
export type CaptureGatePhase = "space" | "descending" | "landed" | "launching" | "onFoot";

export interface CaptureGateInput {
  assistOn: boolean;
  phaseKind: CaptureGatePhase;
  isPrimaryBody: boolean; // is this the body the ship is (about to be) descending onto?
}

export function allowCapture(input: CaptureGateInput): boolean {
  if (!input.assistOn) return true;
  const assistLanding = input.phaseKind === "descending" || input.phaseKind === "landed";
  return !(assistLanding && input.isPrimaryBody);
}
