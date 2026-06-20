export type Intent =
  | "throttleUp"
  | "throttleDown"
  | "pitchUp"
  | "pitchDown"
  | "yawLeft"
  | "yawRight"
  | "rollLeft"
  | "rollRight"
  | "toggleEngine"
  | "openMap"
  | "warp"
  | "toggleExit"
  | "toggleCamera"
  | "walkForward"
  | "walkBack"
  | "walkLeft"
  | "walkRight"
  | "jump";

export const DEFAULT_BINDINGS: Record<string, Intent[]> = {
  KeyW: ["throttleUp", "walkForward"],
  KeyS: ["throttleDown", "walkBack"],
  KeyA: ["yawLeft", "walkLeft"],
  KeyD: ["yawRight", "walkRight"],
  KeyQ: ["rollLeft"],
  KeyE: ["rollRight"],
  ArrowUp: ["pitchUp"],
  ArrowDown: ["pitchDown"],
  Space: ["toggleEngine", "jump"],
  KeyM: ["openMap"],
  KeyJ: ["warp"],
  KeyF: ["toggleExit"],
  KeyC: ["toggleCamera"],
};
