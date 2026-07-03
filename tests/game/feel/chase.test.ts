// tests/game/feel/chase.test.ts
import { describe, it, expect } from "vitest";
import {
  chaseFrame,
  smoothToward,
  DEFAULT_CHASE_PARAMS,
  SlingView,
} from "../../../src/game/feel/chase";
import { Vec3 } from "../../../src/sim/Vec3";

const P = DEFAULT_CHASE_PARAMS;
const shipPos = new Vec3(100, 200, 300);
const fwd = new Vec3(0, 1, 0);
const up = new Vec3(0, 0, 1);

describe("chaseFrame", () => {
  it("sits behind and above the ship, looking ahead", () => {
    const f = chaseFrame(shipPos, fwd, up, 0, null, P);
    const rel = f.camPos.sub(shipPos);
    expect(rel.dot(fwd)).toBeLessThan(0); // behind
    expect(rel.dot(up)).toBeGreaterThan(0); // above
    expect(f.lookAt.sub(shipPos).dot(fwd)).toBeGreaterThan(0); // ahead
  });

  it("pulls back with speed, saturating at vRef", () => {
    const slow = chaseFrame(shipPos, fwd, up, 0, null, P);
    const fast = chaseFrame(shipPos, fwd, up, P.vRef, null, P);
    const faster = chaseFrame(shipPos, fwd, up, P.vRef * 100, null, P);
    const d = (f: { camPos: Vec3 }): number => f.camPos.sub(shipPos).length();
    expect(d(fast)).toBeGreaterThan(d(slow));
    expect(d(faster)).toBeCloseTo(d(fast), 6);
  });

  it("biases out along the swing-plane normal while slung", () => {
    const sling: SlingView = {
      center: shipPos.add(new Vec3(5000, 0, 0)),
      normal: new Vec3(0, 0, 1),
      bodyRadius: 2000,
    };
    const plain = chaseFrame(shipPos, fwd, up, 4000, null, P);
    const slung = chaseFrame(shipPos, fwd, up, 4000, sling, P);
    const biasGain =
      slung.camPos.sub(shipPos).dot(sling.normal) - plain.camPos.sub(shipPos).dot(sling.normal);
    expect(biasGain).toBeGreaterThan(0);
    // aim shifts toward the planet so both stay framed
    expect(slung.lookAt.sub(shipPos).dot(new Vec3(1, 0, 0))).toBeGreaterThan(0);
  });

  it("produces finite output for any speed and degenerate sling normals", () => {
    const sling: SlingView = { center: shipPos, normal: new Vec3(0, 1, 0), bodyRadius: 1 };
    for (const speed of [0, 1e9, NaN]) {
      const f = chaseFrame(shipPos, fwd, up, speed, sling, P);
      for (const v of [f.camPos, f.lookAt]) {
        expect(Number.isFinite(v.x)).toBe(true);
        expect(Number.isFinite(v.y)).toBe(true);
        expect(Number.isFinite(v.z)).toBe(true);
      }
    }
  });
});

describe("smoothToward", () => {
  it("converges exponentially onto the target", () => {
    let cur = new Vec3(0, 0, 0);
    const target = new Vec3(10, -4, 2);
    for (let i = 0; i < 600; i++) cur = smoothToward(cur, target, 6, 1 / 60);
    expect(cur.sub(target).length()).toBeLessThan(0.01);
  });

  it("moves proportionally more with a higher rate", () => {
    const cur = new Vec3(0, 0, 0);
    const target = new Vec3(1, 0, 0);
    const slow = smoothToward(cur, target, 2, 1 / 60);
    const fast = smoothToward(cur, target, 20, 1 / 60);
    expect(fast.x).toBeGreaterThan(slow.x);
    expect(fast.x).toBeLessThanOrEqual(1);
  });

  it("is stable for zero and negative dt", () => {
    const cur = new Vec3(1, 1, 1);
    const target = new Vec3(2, 2, 2);
    expect(smoothToward(cur, target, 6, 0).sub(cur).length()).toBe(0);
    expect(smoothToward(cur, target, 6, -1).sub(cur).length()).toBe(0);
  });
});
