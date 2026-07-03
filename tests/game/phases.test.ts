import { describe, it, expect } from "vitest";
import { nextPhase, spaceAltitude, LAUNCH_CLEAR, PrimaryInfo } from "../../src/game/phases";
import { Phase } from "../../src/sim/GameState";

const earth: PrimaryInfo = { name: "Earth", radius: 3000, landable: true };
const mars: PrimaryInfo = { name: "Mars", radius: 2000, landable: true };
const sun: PrimaryInfo = { name: "Sun", radius: 20000, landable: false };

const base = { altitude: 0, primary: earth, launched: false };

describe("nextPhase", () => {
  it("landed -> launching once launched and clear of the pad", () => {
    const phase: Phase = { kind: "landed", body: "Earth" };
    expect(nextPhase({ ...base, phase, launched: false })).toEqual(phase);
    expect(
      nextPhase({ ...base, phase, launched: true, altitude: LAUNCH_CLEAR + 1 }),
    ).toEqual({ kind: "launching", body: "Earth" });
  });

  it("launching -> space above one body-radius of altitude", () => {
    const phase: Phase = { kind: "launching", body: "Earth" };
    const space = spaceAltitude(earth.radius);
    expect(nextPhase({ ...base, phase, altitude: space + 1, launched: true })).toEqual({
      kind: "space",
    });
    expect(nextPhase({ ...base, phase, altitude: space - 1, launched: true })).toEqual(phase);
  });

  it("space -> descending when low over any landable body", () => {
    const phase: Phase = { kind: "space" };
    const space = spaceAltitude(mars.radius);
    expect(
      nextPhase({ ...base, phase, primary: mars, altitude: space - 1 }),
    ).toEqual({ kind: "descending", body: "Mars" });
    expect(nextPhase({ ...base, phase, primary: mars, altitude: space + 1 })).toEqual(phase);
  });

  it("never descends toward the Sun, no matter how close", () => {
    const phase: Phase = { kind: "space" };
    expect(nextPhase({ ...base, phase, primary: sun, altitude: 100 })).toEqual(phase);
  });

  it("descending -> space when climbing back out (abort)", () => {
    const phase: Phase = { kind: "descending", body: "Mars" };
    expect(
      nextPhase({ ...base, phase, primary: mars, altitude: spaceAltitude(mars.radius) + 1 }),
    ).toEqual({ kind: "space" });
  });

  it("landed and onFoot have no auto-transitions", () => {
    const landedMars: Phase = { kind: "landed", body: "Mars" };
    expect(nextPhase({ ...base, phase: landedMars, primary: mars })).toEqual(landedMars);
    const onFootMars: Phase = { kind: "onFoot", body: "Mars" };
    expect(nextPhase({ ...base, phase: onFootMars, primary: mars })).toEqual(onFootMars);
  });
});
