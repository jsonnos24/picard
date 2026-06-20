import { describe, it, expect } from "vitest";
import {
  initialPhase,
  canTransition,
  transition,
} from "../../src/sim/GameState";

describe("GameState", () => {
  it("starts landed on Earth", () => {
    expect(initialPhase()).toBe("LandedEarth");
  });

  it("allows the nominal mission flow", () => {
    expect(canTransition("LandedEarth", "Launching")).toBe(true);
    expect(canTransition("Launching", "InSpace")).toBe(true);
    expect(canTransition("InSpace", "Descending")).toBe(true);
    expect(canTransition("Descending", "LandedMoon")).toBe(true);
    expect(canTransition("LandedMoon", "OnFoot")).toBe(true);
    expect(canTransition("OnFoot", "LandedMoon")).toBe(true);
  });

  it("allows aborting a descent back to space and relaunching", () => {
    expect(canTransition("Descending", "InSpace")).toBe(true);
    expect(canTransition("LandedMoon", "Launching")).toBe(true);
  });

  it("forbids reaching OnFoot without landing", () => {
    expect(canTransition("InSpace", "OnFoot")).toBe(false);
    expect(canTransition("LandedEarth", "OnFoot")).toBe(false);
  });

  it("transition returns the new phase on a valid move", () => {
    expect(transition("LandedEarth", "Launching")).toBe("Launching");
  });

  it("transition throws on an invalid move", () => {
    expect(() => transition("InSpace", "OnFoot")).toThrow();
  });
});
