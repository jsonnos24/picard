import { describe, it, expect } from "vitest";
import {
  initialPhase,
  canTransition,
  transition,
  samePhase,
  phaseLabel,
  Phase,
} from "../../src/sim/GameState";

const landed = (body: string): Phase => ({ kind: "landed", body });
const launching = (body: string): Phase => ({ kind: "launching", body });
const space: Phase = { kind: "space" };
const descending = (body: string): Phase => ({ kind: "descending", body });
const onFoot = (body: string): Phase => ({ kind: "onFoot", body });

describe("GameState", () => {
  it("starts landed on Earth", () => {
    expect(initialPhase()).toEqual(landed("Earth"));
  });

  it("allows the nominal loop on any body", () => {
    expect(canTransition(landed("Earth"), launching("Earth"))).toBe(true);
    expect(canTransition(launching("Earth"), space)).toBe(true);
    expect(canTransition(space, descending("Mars"))).toBe(true);
    expect(canTransition(descending("Mars"), landed("Mars"))).toBe(true);
    expect(canTransition(landed("Mars"), onFoot("Mars"))).toBe(true);
    expect(canTransition(onFoot("Mars"), landed("Mars"))).toBe(true);
    expect(canTransition(landed("Mars"), launching("Mars"))).toBe(true);
  });

  it("allows aborting a descent back to space", () => {
    expect(canTransition(descending("Venus"), space)).toBe(true);
  });

  it("forbids reaching onFoot without landing", () => {
    expect(canTransition(space, onFoot("Mars"))).toBe(false);
    expect(canTransition(descending("Mars"), onFoot("Mars"))).toBe(false);
  });

  it("forbids skipping launch", () => {
    expect(canTransition(landed("Earth"), space)).toBe(false);
  });

  it("transition returns the new phase on a valid move", () => {
    expect(transition(landed("Earth"), launching("Earth"))).toEqual(launching("Earth"));
  });

  it("transition throws on an invalid move", () => {
    expect(() => transition(space, onFoot("Mars"))).toThrow(/Invalid transition/);
  });

  it("samePhase compares kind and body", () => {
    expect(samePhase(landed("Earth"), landed("Earth"))).toBe(true);
    expect(samePhase(landed("Earth"), landed("Mars"))).toBe(false);
    expect(samePhase(space, space)).toBe(true);
    expect(samePhase(space, landed("Earth"))).toBe(false);
  });

  it("phaseLabel names the body where it matters", () => {
    expect(phaseLabel(landed("Mars"))).toBe("LANDED · MARS");
    expect(phaseLabel(space)).toBe("IN SPACE");
    expect(phaseLabel(onFoot("Moon"))).toBe("ON FOOT · MOON");
  });
});
