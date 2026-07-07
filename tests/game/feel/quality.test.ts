// tests/game/feel/quality.test.ts
import { describe, it, expect } from "vitest";
import {
  resolveQualityTier,
  AUTO_COARSE_DPR_THRESHOLD,
  AUTO_BENCH_MS_THRESHOLD,
} from "../../../src/game/feel/quality";

describe("resolveQualityTier", () => {
  it("passes explicit 'high' straight through regardless of probe", () => {
    expect(resolveQualityTier("high", { dpr: 4, coarsePointer: true, benchFrameMs: 50 })).toBe(
      "high",
    );
  });

  it("passes explicit 'low' straight through regardless of probe", () => {
    expect(resolveQualityTier("low", { dpr: 1, coarsePointer: false })).toBe("low");
  });

  it("auto + coarse pointer at/above the DPR threshold resolves low", () => {
    expect(
      resolveQualityTier("auto", { dpr: AUTO_COARSE_DPR_THRESHOLD, coarsePointer: true }),
    ).toBe("low");
  });

  it("auto + coarse pointer below the DPR threshold resolves high", () => {
    expect(
      resolveQualityTier("auto", {
        dpr: AUTO_COARSE_DPR_THRESHOLD - 0.5,
        coarsePointer: true,
      }),
    ).toBe("high");
  });

  it("auto + a slow bench frame time resolves low", () => {
    expect(
      resolveQualityTier("auto", {
        dpr: 1,
        coarsePointer: false,
        benchFrameMs: AUTO_BENCH_MS_THRESHOLD + 1,
      }),
    ).toBe("low");
  });

  it("auto + no coarse pointer and no/fast bench resolves high", () => {
    expect(resolveQualityTier("auto", { dpr: 1, coarsePointer: false })).toBe("high");
    expect(
      resolveQualityTier("auto", {
        dpr: 1,
        coarsePointer: false,
        benchFrameMs: AUTO_BENCH_MS_THRESHOLD,
      }),
    ).toBe("high");
  });
});
