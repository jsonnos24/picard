import { describe, it, expect } from "vitest";
import { allowCapture } from "../../src/game/captureGate";

describe("allowCapture — scopes landing assist's capture suppression to the assisted descent", () => {
  it("assist off: always allows capture, regardless of phase or body", () => {
    expect(allowCapture({ assistOn: false, phaseKind: "space", isPrimaryBody: true })).toBe(true);
    expect(allowCapture({ assistOn: false, phaseKind: "descending", isPrimaryBody: true })).toBe(
      true,
    );
    expect(allowCapture({ assistOn: false, phaseKind: "descending", isPrimaryBody: false })).toBe(
      true,
    );
    expect(allowCapture({ assistOn: false, phaseKind: "landed", isPrimaryBody: true })).toBe(true);
  });

  it("assist on + descending at the primary body: blocks (the protected assist-land)", () => {
    expect(allowCapture({ assistOn: true, phaseKind: "descending", isPrimaryBody: true })).toBe(
      false,
    );
  });

  it("assist on + space arrival at any body: allows (fresh lightspeed hand-off)", () => {
    expect(allowCapture({ assistOn: true, phaseKind: "space", isPrimaryBody: true })).toBe(true);
    expect(allowCapture({ assistOn: true, phaseKind: "space", isPrimaryBody: false })).toBe(true);
  });

  it("assist on + descending, but a different body: allows", () => {
    expect(allowCapture({ assistOn: true, phaseKind: "descending", isPrimaryBody: false })).toBe(
      true,
    );
  });

  it("assist on + landed at the primary body: blocks (edge case — landed never re-hooks)", () => {
    expect(allowCapture({ assistOn: true, phaseKind: "landed", isPrimaryBody: true })).toBe(false);
  });

  it("assist on + landed, different body: allows", () => {
    expect(allowCapture({ assistOn: true, phaseKind: "landed", isPrimaryBody: false })).toBe(true);
  });
});
