import { Intent } from "../sim/input/bindings";
import { PhaseKind } from "../sim/GameState";

// Resolves what the one big touch button does right now. Pure and testable —
// the DOM layer just renders the verb and injects the intent.

export interface ContextInput {
  phaseKind: PhaseKind;
  slingCaptured: boolean;
  capturedAtTarget: boolean; // the ring we're swinging in belongs to the nav target
  cruising: boolean;
  charging: boolean; // lightspeed sequence mid-charge/burst
  hasTarget: boolean;
  assistOn: boolean;
}

export interface ContextVerb {
  label: string;
  intent: Intent | null;
  hold: boolean; // press-and-hold (throttle, swing) vs tap
}

export function contextAction(c: ContextInput): ContextVerb {
  // Arrival: swinging around the body you targeted. The aligned-release cue is
  // geometrically impossible here (the snap target IS the swing center), so
  // the swing verb would trap the player in orbit — offer the way down.
  if (c.slingCaptured && c.capturedAtTarget) {
    return c.assistOn
      ? { label: "LANDING…", intent: "landingAssist", hold: false }
      : { label: "LAND", intent: "landingAssist", hold: false };
  }
  if (c.slingCaptured) return { label: "HOLD TO SWING", intent: "slingHold", hold: true };
  if (c.cruising) return { label: "DROP OUT", intent: "lightspeed", hold: false };
  if (c.charging) return { label: "CHARGING…", intent: null, hold: false };
  switch (c.phaseKind) {
    case "landed":
      return { label: "HOLD TO LAUNCH", intent: "throttleUp", hold: true };
    case "launching":
    case "space":
      if (c.hasTarget) return { label: "LIGHTSPEED", intent: "lightspeed", hold: false };
      return { label: "BOOST", intent: "throttleUp", hold: true };
    case "descending":
      return c.assistOn
        ? { label: "LANDING…", intent: "landingAssist", hold: false } // tap again to cancel
        : { label: "LAND", intent: "landingAssist", hold: false };
    case "onFoot":
      return { label: "BOARD", intent: "toggleExit", hold: false };
  }
}
