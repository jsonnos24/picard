// tests/game/feel/lightspeedSequence.test.ts
import { describe, it, expect } from "vitest";
import {
  idleSeq,
  startCharge,
  startBurst,
  endCruise,
  stepLsSeq,
  CHARGE_DUR,
  BURST_DUR,
  SETTLE_DUR,
} from "../../../src/game/feel/lightspeedSequence";

describe("lightspeedSequence", () => {
  it("idle does nothing — no engage, no effect", () => {
    const r = stepLsSeq(idleSeq(), 1 / 60);
    expect(r.seq.phase).toBe("idle");
    expect(r.engage).toBe(false);
    expect(r.tunnel).toBeCloseTo(0, 6);
    expect(r.flash).toBeCloseTo(0, 6);
  });

  it("charge pulls FOV in (scale < 1) and does not engage", () => {
    const r = stepLsSeq(startCharge(), CHARGE_DUR * 0.5);
    expect(r.seq.phase).toBe("charge");
    expect(r.fovScale).toBeLessThan(1);
    expect(r.engage).toBe(false);
  });

  it("engages exactly once, on the charge -> burst transition", () => {
    let s = startCharge();
    let engages = 0;
    for (let i = 0; i < 400; i++) {
      const r = stepLsSeq(s, 1 / 60);
      s = r.seq;
      if (r.engage) engages++;
    }
    expect(engages).toBe(1);
    expect(s.phase).toBe("cruise"); // holds in cruise until endCruise
  });

  it("burst widens FOV (scale > 1), flashes, and lights the tunnel", () => {
    const r = stepLsSeq(startCharge(), CHARGE_DUR + BURST_DUR * 0.25);
    expect(r.seq.phase).toBe("burst");
    expect(r.fovScale).toBeGreaterThan(1);
    expect(r.tunnel).toBeGreaterThan(0.2);
    expect(r.flash).toBeGreaterThan(0);
  });

  it("cruise holds a speed-scaled tunnel indefinitely", () => {
    let s = startBurst();
    for (let acc = 0; acc < 30; acc += 0.5) s = stepLsSeq(s, 0.5, 1).seq;
    expect(s.phase).toBe("cruise");
    const slow = stepLsSeq(s, 1 / 60, 0.1);
    const fast = stepLsSeq(s, 1 / 60, 1);
    expect(fast.tunnel).toBeGreaterThan(slow.tunnel);
    expect(fast.fovScale).toBeGreaterThan(1);
  });

  it("startBurst skips the charge (perfect-release reward)", () => {
    const r = stepLsSeq(startBurst(), BURST_DUR * 0.25);
    expect(r.seq.phase).toBe("burst");
    expect(r.flash).toBeGreaterThan(0);
  });

  it("endCruise winds down to idle through settle", () => {
    let s = endCruise({ phase: "cruise", t: 12 });
    expect(s.phase).toBe("settle");
    let last = stepLsSeq(s, 1 / 60);
    for (let acc = 0; acc < SETTLE_DUR + 0.5; acc += 1 / 60) {
      last = stepLsSeq(last.seq, 1 / 60);
    }
    expect(last.seq.phase).toBe("idle");
    expect(last.fovScale).toBeCloseTo(1, 2);
    expect(last.tunnel).toBeCloseTo(0, 2);
  });

  it("endCruise leaves idle and settle untouched", () => {
    expect(endCruise(idleSeq()).phase).toBe("idle");
    expect(endCruise({ phase: "settle", t: 0.2 }).t).toBe(0.2);
  });
});
