import { describe, it, expect } from "vitest";
import { jumpDecision, JumpContext } from "../../src/game/jump";

function ctx(over: Partial<JumpContext> = {}): JumpContext {
  return {
    capturedBody: null,
    targetName: "Mars",
    targetDist: 100_000,
    targetCaptureRadius: 12_000,
    phaseKind: "space",
    ...over,
  };
}

describe("jumpDecision — what J does", () => {
  it("lightspeeds toward a reachable target from free flight", () => {
    expect(jumpDecision(ctx())).toBe("lightspeed");
  });

  it("releases the swing and lightspeeds when captured somewhere else", () => {
    expect(jumpDecision(ctx({ capturedBody: "Earth" }))).toBe("lightspeed");
  });

  it("lands instead of flinging when captured at the nav target", () => {
    // The old fling-then-abort here caused an endless bounce loop.
    expect(
      jumpDecision(ctx({ capturedBody: "Mars", targetDist: 8_000 })),
    ).toBe("land");
  });

  it("lands when drifting inside the target's ring uncaptured", () => {
    expect(jumpDecision(ctx({ targetDist: 8_000 }))).toBe("land");
  });

  it("jumps out of the swing when no target is set", () => {
    expect(jumpDecision(ctx({ capturedBody: "Earth", targetName: null }))).toBe("jump");
  });

  it("does nothing with no target and no swing", () => {
    expect(jumpDecision(ctx({ targetName: null }))).toBe("none");
  });

  it("does nothing while landed", () => {
    expect(jumpDecision(ctx({ phaseKind: "landed" }))).toBe("none");
    expect(jumpDecision(ctx({ phaseKind: "landed", targetDist: 8_000 }))).toBe("none");
  });

  it("does nothing while on foot", () => {
    expect(jumpDecision(ctx({ phaseKind: "onFoot" }))).toBe("none");
  });

  it("still works during launch and descent", () => {
    expect(jumpDecision(ctx({ phaseKind: "launching" }))).toBe("lightspeed");
    expect(jumpDecision(ctx({ phaseKind: "descending" }))).toBe("lightspeed");
  });

  it("does not land-abort a launch off the targeted body itself", () => {
    expect(jumpDecision(ctx({ phaseKind: "launching", targetDist: 8_000 }))).toBe("none");
  });

  it("lands at the target during descent", () => {
    expect(jumpDecision(ctx({ phaseKind: "descending", targetDist: 8_000 }))).toBe("land");
  });
});
