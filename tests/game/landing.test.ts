import { describe, it, expect } from "vitest";
import { evaluateTouchdown, SAFE_VSPEED, SAFE_TILT } from "../../src/game/landing";

const CONTACT = 7;

describe("evaluateTouchdown", () => {
  it("is flying while above contact altitude", () => {
    expect(evaluateTouchdown(100, -2, 0, CONTACT)).toBe("flying");
  });

  it("lands on a soft, upright touchdown", () => {
    expect(evaluateTouchdown(CONTACT, -(SAFE_VSPEED - 1), 0, CONTACT)).toBe("landed");
  });

  it("crashes when descending too fast", () => {
    expect(evaluateTouchdown(CONTACT, -(SAFE_VSPEED + 5), 0, CONTACT)).toBe("crash");
  });

  it("crashes when tilted too far even if slow", () => {
    expect(evaluateTouchdown(CONTACT, -1, SAFE_TILT + 0.1, CONTACT)).toBe("crash");
  });

  it("lands at exactly the safe vertical speed boundary (inclusive)", () => {
    expect(evaluateTouchdown(CONTACT, -SAFE_VSPEED, 0, CONTACT)).toBe("landed");
  });

  it("lands at exactly the safe tilt boundary (inclusive)", () => {
    expect(evaluateTouchdown(CONTACT, -1, SAFE_TILT, CONTACT)).toBe("landed");
  });
});
