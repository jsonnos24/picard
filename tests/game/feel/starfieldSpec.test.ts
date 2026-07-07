import { describe, it, expect } from "vitest";
import {
  generateConstellations,
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

describe("generateConstellations", () => {
  it("is deterministic and emits unit directions", () => {
    const a = generateConstellations(42);
    const b = generateConstellations(42);
    expect(a.positions).toEqual(b.positions);
    expect(a.lineDirs).toEqual(b.lineDirs);
    for (let i = 0; i < a.positions.length; i += 3) {
      const n = Math.hypot(a.positions[i], a.positions[i + 1], a.positions[i + 2]);
      expect(n).toBeCloseTo(1, 6);
    }
  });

  it("different seeds place them differently", () => {
    const a = generateConstellations(1);
    const b = generateConstellations(2);
    expect(a.positions).not.toEqual(b.positions);
  });

  it("stars are big, steady (no twinkle), and line pairs reference star dirs", () => {
    const c = generateConstellations(7);
    expect(c.positions.length).toBeGreaterThan(0);
    for (let i = 0; i < c.sizes.length; i++) {
      expect(c.sizes[i]).toBeGreaterThanOrEqual(2.6);
      expect(c.twinkleAmp[i]).toBe(0);
    }
    // every line endpoint must coincide with some constellation star direction
    expect(c.lineDirs.length % 6).toBe(0);
    const stars = new Set<string>();
    for (let i = 0; i < c.positions.length; i += 3) {
      stars.add([c.positions[i], c.positions[i + 1], c.positions[i + 2]].map(v => v.toFixed(5)).join(","));
    }
    for (let i = 0; i < c.lineDirs.length; i += 3) {
      const key = [c.lineDirs[i], c.lineDirs[i + 1], c.lineDirs[i + 2]].map(v => v.toFixed(5)).join(",");
      expect(stars.has(key)).toBe(true);
    }
  });
});
