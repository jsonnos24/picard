// src/game/feel/lightspeedSequence.ts
// Cinematic envelope for a lightspeed hop: charge (wind-up) → burst (the leap,
// cruise motion begins) → cruise (sustained tunnel, open-ended) → settle.
export type LsSeqPhase = "idle" | "charge" | "burst" | "cruise" | "settle";
export interface LsSeq {
  phase: LsSeqPhase;
  t: number; // seconds elapsed in the current phase
}

export const CHARGE_DUR = 1.0;
export const BURST_DUR = 0.4;
export const SETTLE_DUR = 0.9;

export function idleSeq(): LsSeq {
  return { phase: "idle", t: 0 };
}
export function startCharge(): LsSeq {
  return { phase: "charge", t: 0 };
}
// Perfect-release reward: skip the charge and leap straight into the burst.
export function startBurst(): LsSeq {
  return { phase: "burst", t: 0 };
}
// Arrival or cancel: wind the cruise down.
export function endCruise(seq: LsSeq): LsSeq {
  return seq.phase === "cruise" || seq.phase === "burst" || seq.phase === "charge"
    ? { phase: "settle", t: 0 }
    : seq;
}

export interface LsSeqFrame {
  seq: LsSeq;
  fovScale: number;
  tunnel: number;
  flash: number;
  engage: boolean; // fires once, when cruise motion should begin
}

// FOV pulls in during charge, slams wide at the burst, holds a speed-scaled
// tunnel through the cruise, and eases back over settle.
export function stepLsSeq(seq: LsSeq, dt: number, cruiseIntensity = 1): LsSeqFrame {
  if (seq.phase === "idle") {
    return { seq, fovScale: 1, tunnel: 0, flash: 0, engage: false };
  }
  let { phase, t } = seq;
  t += dt;
  let engage = false;

  // Advance through phase boundaries, carrying overflow time forward.
  if (phase === "charge" && t >= CHARGE_DUR) {
    t -= CHARGE_DUR;
    phase = "burst";
    engage = true; // motion begins at the peak of the leap
  }
  if (phase === "burst" && t >= BURST_DUR) {
    t -= BURST_DUR;
    phase = "cruise";
  }
  if (phase === "settle" && t >= SETTLE_DUR) {
    return { seq: idleSeq(), fovScale: 1, tunnel: 0, flash: 0, engage };
  }

  const k01 = (dur: number): number => Math.max(0, Math.min(1, t / dur));
  let fovScale = 1;
  let tunnel = 0;
  let flash = 0;
  if (phase === "charge") {
    const k = k01(CHARGE_DUR); // 0→1
    fovScale = 1 - 0.18 * k; // pull in to 0.82
    tunnel = 0.15 * k;
  } else if (phase === "burst") {
    const k = k01(BURST_DUR); // 0→1
    fovScale = 1 + 0.4 * (1 - k); // slam to ~1.4, easing down
    tunnel = 1;
    flash = 1 - k; // white bloom fades across the burst
  } else if (phase === "cruise") {
    const s = Math.max(0, Math.min(1, cruiseIntensity));
    fovScale = 1 + 0.12 * s;
    tunnel = 0.35 + 0.65 * s;
  } else {
    // settle
    const k = k01(SETTLE_DUR); // 0→1
    fovScale = 1 + 0.08 * (1 - k);
    tunnel = 1 - k;
  }
  return { seq: { phase, t }, fovScale, tunnel, flash, engage };
}
