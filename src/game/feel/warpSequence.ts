// src/game/feel/warpSequence.ts
export type WarpPhase = "idle" | "charge" | "release" | "settle";
export interface WarpSeq { phase: WarpPhase; t: number } // t = seconds elapsed in current phase

export const CHARGE_DUR = 1.0;
export const RELEASE_DUR = 0.4;
export const SETTLE_DUR = 0.9;

export function idleWarp(): WarpSeq { return { phase: "idle", t: 0 }; }
export function startWarp(): WarpSeq { return { phase: "charge", t: 0 }; }

interface WarpFrame { seq: WarpSeq; fovScale: number; tunnel: number; flash: number; teleport: boolean }

// FOV pulls in during charge, slams wide at release, eases back over settle.
export function stepWarp(seq: WarpSeq, dt: number): WarpFrame {
  if (seq.phase === "idle") {
    return { seq, fovScale: 1, tunnel: 0, flash: 0, teleport: false };
  }
  let { phase, t } = seq;
  t += dt;
  let teleport = false;

  // Advance through phase boundaries, carrying overflow time forward.
  if (phase === "charge" && t >= CHARGE_DUR) {
    t -= CHARGE_DUR; phase = "release"; teleport = true; // teleport fires once, at the peak
  }
  if (phase === "release" && t >= RELEASE_DUR) {
    t -= RELEASE_DUR; phase = "settle";
  }
  if (phase === "settle" && t >= SETTLE_DUR) {
    return { seq: idleWarp(), fovScale: 1, tunnel: 0, flash: 0, teleport };
  }

  let fovScale = 1, tunnel = 0, flash = 0;
  if (phase === "charge") {
    const k = t / CHARGE_DUR;          // 0→1
    fovScale = 1 - 0.18 * k;           // pull in to 0.82
    tunnel = 0.15 * k;
  } else if (phase === "release") {
    const k = t / RELEASE_DUR;         // 0→1
    fovScale = 1 + 0.4 * (1 - k);      // slam to ~1.4, easing down
    tunnel = 1;
    flash = 1 - k;                     // white bloom fades across release
  } else { // settle
    const k = t / SETTLE_DUR;          // 0→1
    fovScale = 1 + 0.08 * (1 - k);
    tunnel = 1 - k;
  }
  return { seq: { phase, t }, fovScale, tunnel, flash, teleport };
}
