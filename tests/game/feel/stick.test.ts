// tests/game/feel/stick.test.ts
import { describe, it, expect } from "vitest";
import { stickVector } from "../../../src/game/feel/stick";

describe("stickVector", () => {
  it("returns zero and inactive inside the dead-zone", () => {
    const v = stickVector(0, 0, 5, 0);
    expect(v).toEqual({ x: 0, y: 0, active: false });
  });

  it("returns zero and inactive at the anchor itself", () => {
    const v = stickVector(10, 10, 10, 10);
    expect(v).toEqual({ x: 0, y: 0, active: false });
  });

  it("is continuous at the dead-zone edge — just past deadR is near zero, not a jump", () => {
    const justInside = stickVector(0, 0, 7.9, 0);
    const justOutside = stickVector(0, 0, 8.1, 0);
    expect(justInside.active).toBe(false);
    expect(justOutside.active).toBe(true);
    expect(justOutside.x).toBeGreaterThan(0);
    expect(justOutside.x).toBeLessThan(0.02); // tiny, not a snap to full scale
  });

  it("rescales linearly from the dead-zone edge to maxR", () => {
    // Halfway between deadR=8 and maxR=80 (len=44) should read 0.5 magnitude.
    const v = stickVector(0, 0, 44, 0);
    expect(v.active).toBe(true);
    expect(v.x).toBeCloseTo(0.5, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });

  it("clamps to a unit vector beyond maxR", () => {
    const v = stickVector(0, 0, 500, 0);
    expect(v.x).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);

    const diag = stickVector(0, 0, 1000, 1000);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 5);
  });

  it("preserves direction for an arbitrary diagonal deflection", () => {
    const v = stickVector(0, 0, 40, 40);
    const mag = Math.hypot(v.x, v.y);
    expect(v.x / mag).toBeCloseTo(1 / Math.sqrt(2), 5);
    expect(v.y / mag).toBeCloseTo(1 / Math.sqrt(2), 5);
  });

  it("is anchor-relative, not absolute", () => {
    const v1 = stickVector(100, 100, 140, 100);
    const v2 = stickVector(0, 0, 40, 0);
    expect(v1).toEqual(v2);
  });

  it("respects custom maxR/deadR params", () => {
    const v = stickVector(0, 0, 10, 0, 40, 4);
    // len=10, deadR=4, maxR=40 -> scale = (10-4)/(40-4) = 6/36 = 1/6
    expect(v.x).toBeCloseTo(1 / 6, 5);
  });
});
