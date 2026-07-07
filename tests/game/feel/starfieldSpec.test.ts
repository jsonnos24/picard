import { describe, it, expect } from "vitest";
import {
  generateStars,
  generateBand,
  bandNormal,
  STAR_TINTS,
} from "../../../src/game/feel/starfieldSpec";

describe("starfieldSpec", () => {
  it("exposes the four flat tints", () => {
    expect(STAR_TINTS).toEqual(["#ffffff", "#ffe9c4", "#cfe0ff", "#8fa3c0"]);
  });

  it("is deterministic for a given seed", () => {
    const a = generateStars(42, 500);
    const b = generateStars(42, 500);
    expect(a.positions).toEqual(b.positions);
    expect(a.sizes).toEqual(b.sizes);
    expect(a.colorIndex).toEqual(b.colorIndex);
    expect(a.twinklePhase).toEqual(b.twinklePhase);
    expect(a.twinkleAmp).toEqual(b.twinkleAmp);
  });

  it("produces different fields for different seeds", () => {
    const a = generateStars(1, 200);
    const b = generateStars(2, 200);
    expect(a.positions).not.toEqual(b.positions);
  });

  it("positions are unit vectors", () => {
    const { positions } = generateStars(7, 1000);
    for (let i = 0; i < 1000; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
    }
  });

  it("size buckets land within tolerance of 85/12/3", () => {
    const count = 20000;
    const { sizes } = generateStars(99, count);
    let small = 0;
    let medium = 0;
    let large = 0;
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(1.0);
      expect(s).toBeLessThanOrEqual(4.0);
      if (s < 1.6) small++;
      else if (s < 2.6) medium++;
      else large++;
    }
    expect(small / count).toBeCloseTo(0.85, 1);
    expect(medium / count).toBeCloseTo(0.12, 1);
    expect(large / count).toBeCloseTo(0.03, 1);
  });

  it("keeps colorIndex within STAR_TINTS bounds", () => {
    const { colorIndex } = generateStars(5, 2000);
    for (const c of colorIndex) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(STAR_TINTS.length);
    }
  });

  it("keeps twinklePhase within [0, 2*PI)", () => {
    const { twinklePhase } = generateStars(3, 1000);
    for (const p of twinklePhase) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
  });

  it("zeroes twinkleAmp for small stars and keeps it in 0.25-0.5 otherwise", () => {
    const { sizes, twinkleAmp } = generateStars(11, 5000);
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] < 1.6) {
        expect(twinkleAmp[i]).toBe(0);
      } else {
        expect(twinkleAmp[i]).toBeGreaterThanOrEqual(0.25);
        expect(twinkleAmp[i]).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("concentrates band positions near the great-circle plane", () => {
    const seed = 21;
    const count = 5000;
    const { positions } = generateBand(seed, count);
    const normal = bandNormal(seed);
    let sumAbsAngle = 0;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const dot = x * normal[0] + y * normal[1] + z * normal[2];
      sumAbsAngle += Math.abs(Math.asin(Math.max(-1, Math.min(1, dot))));
    }
    const meanAbsAngle = sumAbsAngle / count;
    expect(meanAbsAngle).toBeLessThan(0.18 * 1.2);
  });

  it("skews the band's tints toward faint/warm", () => {
    const { colorIndex } = generateBand(13, 5000);
    let faintOrWarm = 0;
    for (const c of colorIndex) if (c === 1 || c === 3) faintOrWarm++;
    expect(faintOrWarm / colorIndex.length).toBeGreaterThan(0.6);
  });
});
