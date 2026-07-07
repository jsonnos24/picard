import { describe, expect, it } from "vitest";
import { padReset } from "../../src/game/padReset";
import { idleBrake } from "../../src/game/retroBrake";

// A crash reset spawns the ship back on the Earth pad. Any state that can
// physically move the ship — a captured sling rail, a lightspeed cruise —
// must be gone, or the next tick drags the "reset" ship across the map.
describe("padReset", () => {
  it("leaves no sling tether", () => {
    const r = padReset();
    expect(r.sling.kind).toBe("none");
    expect(r.slingHeldPrev).toBe(false);
  });

  it("leaves no lightspeed residue", () => {
    const r = padReset();
    expect(r.cruising).toBe(false);
    expect(r.lsTargetName).toBeNull();
    expect(r.lsBraking).toBe(false);
    expect(r.lsSeq.phase).toBe("idle");
    expect(r.lsFree).toBe(false);
    expect(r.lsFreeDir).toBeNull();
  });

  it("clears the perfect-release grace window so a stale chain can't fire", () => {
    const r = padReset();
    // -1 is never a valid future missionElapsed deadline (the clock only counts up).
    expect(r.lsGraceUntil).toBeLessThan(0);
  });

  it("clears retro-brake state", () => {
    const r = padReset();
    expect(r.brake).toEqual(idleBrake());
    expect(r.preBrakeOrient).toBeNull();
  });

  it("clears the breakaway hold", () => {
    const r = padReset();
    expect(r.breakHold).toBe(0);
  });

  it("clears the transient notice", () => {
    const r = padReset();
    expect(r.notice).toBeNull();
    // Deadline must already be in the past — missionElapsed keeps running.
    expect(r.noticeUntil).toBeLessThan(0);
  });
});
