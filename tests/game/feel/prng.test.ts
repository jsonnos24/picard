// tests/game/feel/prng.test.ts
import { describe, it, expect } from "vitest";
import { prng } from "../../../src/game/feel/prng";

describe("prng", () => {
  it("is deterministic — same seed produces the same sequence", () => {
    const a = prng(42);
    const b = prng(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("returns floats in [0, 1)", () => {
    const rand = prng(1234);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = prng(1);
    const b = prng(2);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).not.toEqual(seqB);
  });

  it("advances state each call rather than repeating the first value", () => {
    const rand = prng(7);
    const first = rand();
    const second = rand();
    expect(first).not.toBe(second);
  });
});
