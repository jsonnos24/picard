import { describe, it, expect } from "vitest";
import { createInputManager } from "../../src/sim/input/InputManager";

describe("InputManager", () => {
  it("tracks held intents via isActive", () => {
    const im = createInputManager();
    expect(im.isActive("throttleUp")).toBe(false);
    im.handleKey("KeyW", true);
    expect(im.isActive("throttleUp")).toBe(true);
    im.handleKey("KeyW", false);
    expect(im.isActive("throttleUp")).toBe(false);
  });

  it("maps one physical key to flight and on-foot intents together", () => {
    const im = createInputManager();
    im.handleKey("KeyW", true);
    expect(im.isActive("throttleUp")).toBe(true);
    expect(im.isActive("walkForward")).toBe(true);
  });

  it("edge-triggers consumePressed once per press", () => {
    const im = createInputManager();
    im.handleKey("KeyM", true);
    expect(im.consumePressed("openMap")).toBe(true);
    expect(im.consumePressed("openMap")).toBe(false); // already consumed
    im.handleKey("KeyM", false);
    im.handleKey("KeyM", true);
    expect(im.consumePressed("openMap")).toBe(true); // new press
  });

  it("maps warp to KeyJ", () => {
    const im = createInputManager();
    im.handleKey("KeyJ", true);
    expect(im.consumePressed("warp")).toBe(true);
  });

  it("ignores unbound keys", () => {
    const im = createInputManager();
    im.handleKey("KeyZ", true);
    expect(im.isActive("throttleUp")).toBe(false);
  });
});
