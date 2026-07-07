// src/game/feel/quality.ts
// Resolves the player's Settings.quality ("auto"|"high"|"low") to a concrete
// render tier. Pure + zero-Three so it's unit-testable in node — the caller
// (Game.ts) supplies the probe (devicePixelRatio, a matchMedia read, and
// later an optional post-startup frame-time bench) and forwards the result
// to Renderer.setQualityTier.
export type QualityTier = "high" | "low";

// Coarse pointer (touch) + a high DPR (phone/tablet) is the "probably a
// weaker GPU" signal auto-detection leans on absent any bench data yet.
export const AUTO_COARSE_DPR_THRESHOLD = 2.5;
// A bench average above this many ms/frame (well under 60fps) downgrades
// even a fine-pointer/low-DPR device once we've actually measured it.
export const AUTO_BENCH_MS_THRESHOLD = 12;

export interface QualityProbe {
  dpr: number;
  coarsePointer: boolean;
  benchFrameMs?: number;
}

export function resolveQualityTier(
  setting: "auto" | "high" | "low",
  probe: QualityProbe,
): QualityTier {
  if (setting === "high" || setting === "low") return setting;
  if (probe.coarsePointer && probe.dpr >= AUTO_COARSE_DPR_THRESHOLD) return "low";
  if (probe.benchFrameMs !== undefined && probe.benchFrameMs > AUTO_BENCH_MS_THRESHOLD) {
    return "low";
  }
  return "high";
}
