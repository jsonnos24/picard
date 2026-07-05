import { describe, expect, it } from "vitest";
import { padReset } from "../../src/game/padReset";

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
});
