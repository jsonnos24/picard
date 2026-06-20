import { describe, it, expect } from "vitest";
import {
  createFloatingOrigin,
  toRender,
  rebase,
} from "../../src/sim/FloatingOrigin";
import { Vec3 } from "../../src/sim/Vec3";

describe("FloatingOrigin", () => {
  it("renders universe positions relative to the offset", () => {
    const fo = { offset: new Vec3(100, 0, 0), threshold: 1e4 };
    expect(toRender(fo, new Vec3(150, 0, 0))).toEqual(new Vec3(50, 0, 0));
  });

  it("rebases when the player drifts past the threshold", () => {
    let fo = createFloatingOrigin(1e4);
    const player = new Vec3(2e4, 0, 0); // render dist 2e4 > 1e4
    fo = rebase(fo, player);
    // after rebase, player renders at ~origin
    expect(toRender(fo, player).length()).toBeCloseTo(0, 6);
  });

  it("does not rebase when within the threshold", () => {
    const fo = createFloatingOrigin(1e4);
    const player = new Vec3(5e3, 0, 0);
    const after = rebase(fo, player);
    expect(after.offset).toEqual(fo.offset);
  });

  it("preserves relative positions exactly across a rebase", () => {
    let fo = createFloatingOrigin(1e4);
    const player = new Vec3(2e4, 0, 0);
    const other = new Vec3(2e4 + 37, 5, -9);
    const relBefore = toRender(fo, other).sub(toRender(fo, player));
    fo = rebase(fo, player);
    const relAfter = toRender(fo, other).sub(toRender(fo, player));
    expect(relAfter.x).toBeCloseTo(relBefore.x, 6);
    expect(relAfter.y).toBeCloseTo(relBefore.y, 6);
    expect(relAfter.z).toBeCloseTo(relBefore.z, 6);
  });
});
