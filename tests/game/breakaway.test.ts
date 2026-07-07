import { describe, it, expect } from "vitest";
import { stepBreakaway, BREAKAWAY_HOLD, capturedPrecedence } from "../../src/game/breakaway";

const DT = 1 / 60;

function hold(seconds: number, from = 0): { hold: number; free: boolean } {
  let r = { hold: from, free: false };
  for (let t = 0; t < seconds; t += DT) r = stepBreakaway(r.hold, true, DT);
  return r;
}

describe("stepBreakaway — thrust powers the ship off the swing rail", () => {
  it("does not free the ship on a quick tap", () => {
    expect(hold(BREAKAWAY_HOLD * 0.5).free).toBe(false);
  });

  it("frees the ship once thrust is held long enough", () => {
    expect(hold(BREAKAWAY_HOLD + 0.1).free).toBe(true);
  });

  it("letting go of thrust resets the hold", () => {
    const mid = hold(BREAKAWAY_HOLD * 0.8);
    const released = stepBreakaway(mid.hold, false, DT);
    expect(released.hold).toBe(0);
    expect(released.free).toBe(false);
    // A fresh hold needs the full duration again.
    expect(hold(BREAKAWAY_HOLD * 0.8, released.hold).free).toBe(false);
  });
});

describe("capturedPrecedence — breakaway always outranks the landing assist", () => {
  it("returns breakaway once the hold is free, regardless of assist", () => {
    expect(capturedPrecedence(true, true)).toBe("breakaway");
    expect(capturedPrecedence(true, false)).toBe("breakaway");
  });

  it("returns assistLand when assist is on and breakaway hasn't freed the ship", () => {
    expect(capturedPrecedence(false, true)).toBe("assistLand");
  });

  it("returns swing when neither breakaway nor assist apply", () => {
    expect(capturedPrecedence(false, false)).toBe("swing");
  });
});
