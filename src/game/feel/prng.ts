// src/game/feel/prng.ts
// Mulberry32 — a tiny, fast, seeded PRNG. Deterministic across runs so the
// generative music bed and any other seeded-random feel logic can be
// unit-tested exactly and replay identically in a headless environment.

// Pure single-step form: given a 32-bit state, returns the next state and
// the random value it produces. Exposed (in addition to `prng` below) so
// callers that need their random state to be plain, serializable data — like
// musicBed's MusicState — can thread it through without holding a closure.
export function mulberry32Step(state: number): { next: number; value: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { next, value };
}

export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    const r = mulberry32Step(state);
    state = r.next;
    return r.value;
  };
}
