import { describe, it, expect } from "vitest";
import {
  idleBrake,
  stepBrake,
  BRAKE_GRACE,
  BrakeState,
  BrakeInput,
} from "../../src/game/retroBrake";

const DT = 1 / 60;

function flight(over: Partial<BrakeInput> = {}): BrakeInput {
  return {
    braking: true,
    throttle: 0,
    speed: 100,
    inFlight: true,
    aMax: 30,
    dt: DT,
    ...over,
  };
}

// Run the state machine for `seconds`, returning the last result.
function run(state: BrakeState, input: BrakeInput, seconds: number) {
  let s = state;
  let command = "none" as ReturnType<typeof stepBrake>["command"];
  for (let t = 0; t < seconds; t += input.dt) {
    const r = stepBrake(s, input);
    s = r.state;
    command = r.command;
  }
  return { state: s, command };
}

describe("retroBrake", () => {
  it("does not flip during the grace period after throttle reaches zero", () => {
    const r = run(idleBrake(), flight(), BRAKE_GRACE * 0.5);
    expect(r.command).toBe("none");
  });

  it("easing throttle to zero then letting go never burns", () => {
    // Held S drags throttle to 0, player releases within the grace window.
    const mid = run(idleBrake(), flight(), BRAKE_GRACE * 0.6);
    const r = stepBrake(mid.state, flight({ braking: false }));
    expect(r.command).toBe("none");
  });

  it("engages the burn after S is held past the grace period", () => {
    const r = run(idleBrake(), flight(), BRAKE_GRACE + 0.1);
    expect(r.command).toBe("burn");
  });

  it("throttle above zero while held keeps resetting the grace timer", () => {
    // Player still easing down: throttle hasn't reached 0 yet.
    const mid = run(idleBrake(), flight({ throttle: 0.3 }), BRAKE_GRACE * 2);
    expect(mid.command).toBe("none");
    // Once throttle hits 0 the full grace period still applies.
    const r = run(mid.state, flight(), BRAKE_GRACE * 0.5);
    expect(r.command).toBe("none");
  });

  it("stays engaged even though the burn itself raises the throttle", () => {
    const engaged = run(idleBrake(), flight(), BRAKE_GRACE + 0.1);
    const r = stepBrake(engaged.state, flight({ throttle: 1 }));
    expect(r.command).toBe("burn");
  });

  it("releasing S while engaged commands a release and resets", () => {
    const engaged = run(idleBrake(), flight(), BRAKE_GRACE + 0.1);
    const r = stepBrake(engaged.state, flight({ braking: false, throttle: 1 }));
    expect(r.command).toBe("release");
    // Fully reset: the next hold starts a fresh grace period.
    const again = run(r.state, flight(), BRAKE_GRACE * 0.5);
    expect(again.command).toBe("none");
  });

  it("commands a clean stop when speed drops within one burn step of zero", () => {
    const engaged = run(idleBrake(), flight(), BRAKE_GRACE + 0.1);
    const r = stepBrake(engaged.state, flight({ throttle: 1, speed: 0.1 }));
    expect(r.command).toBe("stop");
  });

  it("holding S at zero speed after the stop does nothing", () => {
    const engaged = run(idleBrake(), flight(), BRAKE_GRACE + 0.1);
    const stopped = stepBrake(engaged.state, flight({ throttle: 1, speed: 0.1 }));
    const r = run(stopped.state, flight({ speed: 0 }), BRAKE_GRACE * 2);
    expect(r.command).toBe("none");
  });

  it("never engages while landed", () => {
    const r = run(idleBrake(), flight({ inFlight: false }), BRAKE_GRACE * 2);
    expect(r.command).toBe("none");
  });
});
