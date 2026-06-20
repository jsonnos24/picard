import { describe, it, expect } from "vitest";
import { fmtMissionTime } from "../../src/ui/HUD";

describe("fmtMissionTime", () => {
  it("shows 0s at the start", () => {
    expect(fmtMissionTime(0)).toBe("T+ 0s");
  });
  it("shows seconds only under a minute", () => {
    expect(fmtMissionTime(45)).toBe("T+ 45s");
  });
  it("shows minutes and seconds", () => {
    expect(fmtMissionTime(90)).toBe("T+ 1m 30s");
  });
  it("shows the two largest units (hours, minutes)", () => {
    expect(fmtMissionTime(3661)).toBe("T+ 1h 1m");
  });
  it("shows days and hours", () => {
    expect(fmtMissionTime(90000)).toBe("T+ 1d 1h");
  });
  it("shows weeks and days", () => {
    expect(fmtMissionTime(700000)).toBe("T+ 1w 1d");
  });
});
