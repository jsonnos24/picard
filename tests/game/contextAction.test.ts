import { describe, it, expect } from "vitest";
import { contextAction, ContextInput } from "../../src/game/contextAction";

const base: ContextInput = {
  phaseKind: "space",
  slingCaptured: false,
  capturedAtTarget: false,
  cruising: false,
  charging: false,
  hasTarget: false,
  assistOn: false,
};

describe("contextAction", () => {
  it("captured beats everything: hold to swing", () => {
    const v = contextAction({ ...base, slingCaptured: true, cruising: true, hasTarget: true });
    expect(v.intent).toBe("slingHold");
    expect(v.hold).toBe(true);
  });

  it("captured around the nav target: tap to land — arrival must not trap the player", () => {
    // The release cue can never fire here (the snap target IS the swing
    // center), so the button must offer the way down instead of the swing.
    const v = contextAction({
      ...base,
      slingCaptured: true,
      capturedAtTarget: true,
      hasTarget: true,
    });
    expect(v.intent).toBe("landingAssist");
    expect(v.label).toBe("LAND");
    expect(v.hold).toBe(false);
  });

  it("captured at the target while assist already runs: label flips", () => {
    const v = contextAction({
      ...base,
      slingCaptured: true,
      capturedAtTarget: true,
      hasTarget: true,
      assistOn: true,
    });
    expect(v.intent).toBe("landingAssist");
    expect(v.label).not.toBe("LAND");
  });

  it("cruising: tap to drop out", () => {
    const v = contextAction({ ...base, cruising: true });
    expect(v.intent).toBe("lightspeed");
    expect(v.hold).toBe(false);
  });

  it("charging: momentarily inert", () => {
    const v = contextAction({ ...base, charging: true });
    expect(v.intent).toBeNull();
  });

  it("landed: hold to launch (throttle)", () => {
    const v = contextAction({ ...base, phaseKind: "landed" });
    expect(v.intent).toBe("throttleUp");
    expect(v.hold).toBe(true);
  });

  it("space with a target: lightspeed; without: boost", () => {
    expect(contextAction({ ...base, hasTarget: true }).intent).toBe("lightspeed");
    expect(contextAction(base).intent).toBe("throttleUp");
  });

  it("launching mirrors space", () => {
    expect(contextAction({ ...base, phaseKind: "launching", hasTarget: true }).intent).toBe(
      "lightspeed",
    );
    expect(contextAction({ ...base, phaseKind: "launching" }).intent).toBe("throttleUp");
  });

  it("descending: tap to land, and the label flips while assisting", () => {
    const idle = contextAction({ ...base, phaseKind: "descending" });
    expect(idle.intent).toBe("landingAssist");
    expect(idle.label).toBe("LAND");
    const busy = contextAction({ ...base, phaseKind: "descending", assistOn: true });
    expect(busy.intent).toBe("landingAssist");
    expect(busy.label).not.toBe("LAND");
  });

  it("on foot: board the ship", () => {
    expect(contextAction({ ...base, phaseKind: "onFoot" }).intent).toBe("toggleExit");
  });
});
