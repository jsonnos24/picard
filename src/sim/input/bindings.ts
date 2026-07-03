export type Intent =
  | "throttleUp"
  | "throttleDown"
  | "pitchUp"
  | "pitchDown"
  | "yawLeft"
  | "yawRight"
  | "rollLeft"
  | "rollRight"
  | "slingHold"
  | "openMap"
  | "lightspeed"
  | "toggleExit"
  | "toggleCamera"
  | "walkForward"
  | "walkBack"
  | "walkLeft"
  | "walkRight"
  | "jump"
  | "landingAssist";

export const DEFAULT_BINDINGS: Record<string, Intent[]> = {
  KeyW: ["throttleUp", "walkForward"],
  KeyS: ["throttleDown", "walkBack"],
  KeyA: ["yawLeft", "walkLeft"],
  KeyD: ["yawRight", "walkRight"],
  KeyQ: ["rollLeft"],
  KeyE: ["rollRight"],
  ArrowUp: ["pitchUp"],
  ArrowDown: ["pitchDown"],
  Space: ["slingHold", "jump"],
  KeyM: ["openMap"],
  KeyJ: ["lightspeed"],
  KeyF: ["toggleExit"],
  KeyC: ["toggleCamera"],
  KeyL: ["landingAssist"], // toggle auto-descent / soft-landing assist
};
