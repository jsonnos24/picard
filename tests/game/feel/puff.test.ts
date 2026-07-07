// tests/game/feel/puff.test.ts
import { describe, it, expect } from "vitest";
import { spawnPuff, stepPuff } from "../../../src/game/feel/puff";

describe("spawnPuff", () => {
  it("produces exactly n particles", () => {
    expect(spawnPuff(1, 10, 1).length).toBe(10);
    expect(spawnPuff(1, 42, 1).length).toBe(42);
  });

  it("gives every particle an upward-biased unit direction", () => {
    const particles = spawnPuff(1, 30, 1);
    for (const p of particles) {
      const mag = Math.sqrt(p.px * p.px + p.py * p.py + p.pz * p.pz);
      expect(mag).toBeCloseTo(1, 5);
      expect(p.py).toBeGreaterThan(0);
    }
  });

  it("scales speed and size up with intensity", () => {
    const soft = spawnPuff(7, 20, 0.5);
    const hard = spawnPuff(7, 20, 1);
    const crash = spawnPuff(7, 20, 1.5);
    const avg = (arr: { speed: number; baseSize: number }[], key: "speed" | "baseSize") =>
      arr.reduce((s, p) => s + p[key], 0) / arr.length;
    expect(avg(hard, "speed")).toBeGreaterThan(avg(soft, "speed"));
    expect(avg(crash, "speed")).toBeGreaterThan(avg(hard, "speed"));
    expect(avg(hard, "baseSize")).toBeGreaterThan(avg(soft, "baseSize"));
    expect(avg(crash, "baseSize")).toBeGreaterThan(avg(hard, "baseSize"));
  });

  it("is deterministic given the same seed, count, and intensity", () => {
    const a = spawnPuff(123, 15, 1);
    const b = spawnPuff(123, 15, 1);
    expect(a).toEqual(b);
  });
});

describe("stepPuff", () => {
  it("slows particles down via drag over time", () => {
    const p0 = spawnPuff(1, 5, 1);
    const p1 = stepPuff(p0, 0.1);
    for (let i = 0; i < p0.length; i++) {
      expect(p1[i].speed).toBeLessThan(p0[i].speed);
    }
  });

  it("counts life down", () => {
    const p0 = spawnPuff(1, 5, 1);
    const p1 = stepPuff(p0, 0.1);
    for (let i = 0; i < p0.length; i++) {
      expect(p1[i].life).toBeLessThan(p0[i].life);
    }
  });

  it("drops particles once their life reaches zero", () => {
    let particles = spawnPuff(1, 8, 1);
    for (let i = 0; i < 200; i++) particles = stepPuff(particles, 0.05);
    expect(particles.length).toBe(0);
  });

  it("is a no-op when dt is 0", () => {
    const p0 = spawnPuff(1, 5, 1);
    const p1 = stepPuff(p0, 0);
    expect(p1).toEqual(p0);
  });

  it("is deterministic across identical step sequences", () => {
    let a = spawnPuff(55, 12, 1);
    let b = spawnPuff(55, 12, 1);
    for (let i = 0; i < 20; i++) {
      a = stepPuff(a, 0.03);
      b = stepPuff(b, 0.03);
    }
    expect(a).toEqual(b);
  });
});
