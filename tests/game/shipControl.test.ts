import { describe, it, expect } from "vitest";
import { nextThrottle, shouldHoldOnSurface, THROTTLE_RATE } from "../../src/game/shipControl";
import { Intent } from "../../src/sim/input/bindings";

function fakeInput(active: Intent[]) {
  return { isActive: (i: Intent) => active.includes(i) };
}

describe("shipControl", () => {
  it("raises throttle while throttleUp is held", () => {
    expect(nextThrottle(0, fakeInput(["throttleUp"]), 0.5)).toBeCloseTo(THROTTLE_RATE * 0.5, 6);
  });

  it("lowers throttle while throttleDown is held", () => {
    expect(nextThrottle(1, fakeInput(["throttleDown"]), 0.5)).toBeCloseTo(1 - THROTTLE_RATE * 0.5, 6);
  });

  it("clamps throttle to [0,1]", () => {
    expect(nextThrottle(1, fakeInput(["throttleUp"]), 5)).toBe(1);
    expect(nextThrottle(0, fakeInput(["throttleDown"]), 5)).toBe(0);
  });

  it("holds on surface only when thrust can't beat gravity", () => {
    expect(shouldHoldOnSurface(5, 9.81)).toBe(true);
    expect(shouldHoldOnSurface(12, 9.81)).toBe(false);
  });
});
