import { describe, it, expect } from "vitest";
import { Vec3 } from "../../src/sim/Vec3";

describe("Vec3", () => {
  it("adds and subtracts", () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(4, 5, 6);
    expect(a.add(b)).toEqual(new Vec3(5, 7, 9));
    expect(b.sub(a)).toEqual(new Vec3(3, 3, 3));
  });

  it("scales and dots", () => {
    expect(new Vec3(1, 2, 3).scale(2)).toEqual(new Vec3(2, 4, 6));
    expect(new Vec3(1, 0, 0).dot(new Vec3(0, 1, 0))).toBe(0);
  });

  it("crosses right-handed", () => {
    expect(new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0))).toEqual(new Vec3(0, 0, 1));
    expect(new Vec3(0, 1, 0).cross(new Vec3(1, 0, 0))).toEqual(new Vec3(0, 0, -1));
    const a = new Vec3(2, -1, 3);
    const b = new Vec3(-4, 5, 6);
    const c = a.cross(b);
    expect(c.dot(a)).toBeCloseTo(0, 10);
    expect(c.dot(b)).toBeCloseTo(0, 10);
  });

  it("computes length and normalizes", () => {
    expect(new Vec3(3, 4, 0).length()).toBe(5);
    expect(new Vec3(3, 4, 0).lengthSq()).toBe(25);
    expect(new Vec3(0, 8, 0).normalize()).toEqual(new Vec3(0, 1, 0));
  });

  it("normalizing zero returns zero", () => {
    expect(new Vec3(0, 0, 0).normalize()).toEqual(new Vec3(0, 0, 0));
  });

  it("does not mutate the original", () => {
    const a = new Vec3(1, 1, 1);
    a.add(new Vec3(1, 1, 1));
    expect(a).toEqual(new Vec3(1, 1, 1));
  });
});
