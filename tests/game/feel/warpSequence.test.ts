// tests/game/feel/warpSequence.test.ts
import { describe, it, expect } from "vitest";
import {
  idleWarp, startWarp, stepWarp,
  CHARGE_DUR, RELEASE_DUR, SETTLE_DUR,
} from "../../../src/game/feel/warpSequence";

describe("warpSequence", () => {
  it("idle does nothing — no teleport, no effect", () => {
    const r = stepWarp(idleWarp(), 1 / 60);
    expect(r.seq.phase).toBe("idle");
    expect(r.teleport).toBe(false);
    expect(r.tunnel).toBeCloseTo(0, 6);
    expect(r.flash).toBeCloseTo(0, 6);
  });

  it("charge phase pulls FOV in (scale < 1) and does not teleport", () => {
    const r = stepWarp(startWarp(), CHARGE_DUR * 0.5);
    expect(r.seq.phase).toBe("charge");
    expect(r.fovScale).toBeLessThan(1);
    expect(r.teleport).toBe(false);
  });

  it("teleports exactly once, on the charge→release transition", () => {
    let s = startWarp();
    let teleports = 0;
    // Step through the whole sequence in small ticks.
    for (let i = 0; i < 200; i++) {
      const r = stepWarp(s, 1 / 60);
      s = r.seq;
      if (r.teleport) teleports++;
    }
    expect(teleports).toBe(1);
  });

  it("release widens FOV (scale > 1) and lights the tunnel", () => {
    // Advance just past charge into release.
    let r = stepWarp(startWarp(), CHARGE_DUR + RELEASE_DUR * 0.25);
    expect(r.seq.phase).toBe("release");
    expect(r.fovScale).toBeGreaterThan(1);
    expect(r.tunnel).toBeGreaterThan(0.2);
  });

  it("returns to idle after the full duration with neutral FOV", () => {
    let s = startWarp();
    let last = stepWarp(s, 1 / 60);
    const total = CHARGE_DUR + RELEASE_DUR + SETTLE_DUR + 0.5;
    for (let acc = 0; acc < total; acc += 1 / 60) { last = stepWarp(last.seq, 1 / 60); }
    expect(last.seq.phase).toBe("idle");
    expect(last.fovScale).toBeCloseTo(1, 2);
    expect(last.tunnel).toBeCloseTo(0, 2);
  });
});
