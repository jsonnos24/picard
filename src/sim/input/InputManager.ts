import { Intent, DEFAULT_BINDINGS } from "./bindings";

export interface InputManager {
  handleKey(code: string, isDown: boolean): void;
  isActive(intent: Intent): boolean;
  consumePressed(intent: Intent): boolean;
}

export function createInputManager(
  bindings: Record<string, Intent[]> = DEFAULT_BINDINGS,
): InputManager {
  const active = new Set<Intent>();
  const pressed = new Set<Intent>(); // edge-triggered, awaiting consume

  return {
    handleKey(code: string, isDown: boolean): void {
      const intents = bindings[code];
      if (!intents) return;
      for (const intent of intents) {
        if (isDown) {
          if (!active.has(intent)) pressed.add(intent); // rising edge
          active.add(intent);
        } else {
          active.delete(intent);
        }
      }
    },
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
  };
}
