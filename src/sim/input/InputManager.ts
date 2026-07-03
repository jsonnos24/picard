import { Intent, DEFAULT_BINDINGS } from "./bindings";

export type Axis = "steerX" | "steerY"; // -1..1; right / nose-up positive

export interface InputManager {
  handleKey(code: string, isDown: boolean): void;
  isActive(intent: Intent): boolean;
  consumePressed(intent: Intent): boolean;
  // Touch sources feed the same intent stream (identical edge semantics)...
  injectIntent(intent: Intent, isDown: boolean): void;
  // ...plus smooth analog steering. When no axis override is set, getAxis
  // derives ±1 from the digital intents, so keyboard flight is unchanged.
  setAxis(axis: Axis, value: number): void;
  clearAxis(axis: Axis): void;
  getAxis(axis: Axis): number;
  // The raw touch override, or null when none is active. For contexts (walking)
  // where the intent-derived fallback would double-count the same keys.
  getAxisOverride(axis: Axis): number | null;
}

export function createInputManager(
  bindings: Record<string, Intent[]> = DEFAULT_BINDINGS,
): InputManager {
  const active = new Set<Intent>();
  const pressed = new Set<Intent>(); // edge-triggered, awaiting consume
  const axes = new Map<Axis, number>();

  function applyIntent(intent: Intent, isDown: boolean): void {
    if (isDown) {
      if (!active.has(intent)) pressed.add(intent); // rising edge
      active.add(intent);
    } else {
      active.delete(intent);
    }
  }

  const is = (intent: Intent): number => (active.has(intent) ? 1 : 0);

  return {
    handleKey(code: string, isDown: boolean): void {
      const intents = bindings[code];
      if (!intents) return;
      for (const intent of intents) applyIntent(intent, isDown);
    },
    injectIntent: applyIntent,
    isActive(intent: Intent): boolean {
      return active.has(intent);
    },
    consumePressed(intent: Intent): boolean {
      if (pressed.has(intent)) {
        pressed.delete(intent);
        return true;
      }
      return false;
    },
    setAxis(axis: Axis, value: number): void {
      axes.set(axis, Math.max(-1, Math.min(1, value)));
    },
    clearAxis(axis: Axis): void {
      axes.delete(axis);
    },
    getAxis(axis: Axis): number {
      const override = axes.get(axis);
      if (override !== undefined) return override;
      return axis === "steerX"
        ? is("yawRight") - is("yawLeft")
        : is("pitchUp") - is("pitchDown");
    },
    getAxisOverride(axis: Axis): number | null {
      return axes.get(axis) ?? null;
    },
  };
}
