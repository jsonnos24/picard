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

  it("maps lightspeed to KeyJ", () => {
    const im = createInputManager();
    im.handleKey("KeyJ", true);
    expect(im.consumePressed("lightspeed")).toBe(true);
  });

  it("ignores unbound keys", () => {
    const im = createInputManager();
    im.handleKey("KeyZ", true);
    expect(im.isActive("throttleUp")).toBe(false);
  });

  it("injectIntent shares edge semantics with handleKey", () => {
    const im = createInputManager();
    im.injectIntent("lightspeed", true);
    expect(im.isActive("lightspeed")).toBe(true);
    expect(im.consumePressed("lightspeed")).toBe(true);
    expect(im.consumePressed("lightspeed")).toBe(false); // consumed
    im.injectIntent("lightspeed", true); // still held: no new rising edge
    expect(im.consumePressed("lightspeed")).toBe(false);
    im.injectIntent("lightspeed", false);
    im.injectIntent("lightspeed", true);
    expect(im.consumePressed("lightspeed")).toBe(true); // new press
  });

  it("derives steering axes from digital intents when no override is set", () => {
    const im = createInputManager();
    expect(im.getAxis("steerX")).toBe(0);
    im.handleKey("KeyD", true); // yawRight
    expect(im.getAxis("steerX")).toBe(1);
    im.handleKey("ArrowUp", true); // pitchUp
    expect(im.getAxis("steerY")).toBe(1);
    expect(im.getAxisOverride("steerX")).toBeNull();
  });

  it("axis overrides win over intents, clamp, and clear back to fallback", () => {
    const im = createInputManager();
    im.handleKey("KeyD", true); // fallback would be +1
    im.setAxis("steerX", -0.4);
    expect(im.getAxis("steerX")).toBeCloseTo(-0.4, 6);
    expect(im.getAxisOverride("steerX")).toBeCloseTo(-0.4, 6);
    im.setAxis("steerX", 5); // clamped
    expect(im.getAxis("steerX")).toBe(1);
    im.clearAxis("steerX");
    expect(im.getAxis("steerX")).toBe(1); // back to intent-derived
    expect(im.getAxisOverride("steerX")).toBeNull();
  });
});
