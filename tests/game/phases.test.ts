import { describe, it, expect } from "vitest";
import { nextPhase, SPACE_ALTITUDE, LAUNCH_CLEAR } from "../../src/game/phases";

const base = { altitude: 0, inAtmosphere: true, primaryName: "Earth", launched: false };

describe("nextPhase", () => {
  it("LandedEarth -> Launching once launched", () => {
    expect(nextPhase({ ...base, phase: "LandedEarth", launched: false })).toBe("LandedEarth");
    expect(nextPhase({ ...base, phase: "LandedEarth", launched: true, altitude: LAUNCH_CLEAR + 1 })).toBe("Launching");
  });

  it("Launching -> InSpace above the space altitude", () => {
    expect(nextPhase({ ...base, phase: "Launching", altitude: SPACE_ALTITUDE + 1, launched: true })).toBe("InSpace");
    expect(nextPhase({ ...base, phase: "Launching", altitude: SPACE_ALTITUDE - 1, launched: true })).toBe("Launching");
  });

  it("InSpace -> Descending when low over the Moon", () => {
    expect(nextPhase({ ...base, phase: "InSpace", primaryName: "Moon", altitude: SPACE_ALTITUDE - 1, inAtmosphere: false })).toBe("Descending");
    expect(nextPhase({ ...base, phase: "InSpace", primaryName: "Moon", altitude: SPACE_ALTITUDE + 1, inAtmosphere: false })).toBe("InSpace");
  });

  it("Descending -> InSpace when climbing back out (abort)", () => {
    expect(nextPhase({ ...base, phase: "Descending", primaryName: "Moon", altitude: SPACE_ALTITUDE + 1, inAtmosphere: false })).toBe("InSpace");
  });

  it("LandedMoon has no auto-transition (stays LandedMoon)", () => {
    expect(nextPhase({ ...base, phase: "LandedMoon", primaryName: "Moon", altitude: 0, inAtmosphere: false })).toBe("LandedMoon");
  });

  it("OnFoot has no auto-transition (stays OnFoot)", () => {
    expect(nextPhase({ ...base, phase: "OnFoot", primaryName: "Moon", altitude: 0, inAtmosphere: false })).toBe("OnFoot");
  });
});
