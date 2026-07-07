// tests/game/feel/planetSurface.test.ts
import { describe, it, expect } from "vitest";
import { surfaceSpec } from "../../../src/game/feel/planetSurface";

const KNOWN_BODIES = [
  "Jupiter",
  "Saturn",
  "Earth",
  "Mars",
  "Mercury",
  "Moon",
  "Venus",
  "Neptune",
  "Uranus",
];

function checkLatRange(latDeg: number): void {
  expect(latDeg).toBeGreaterThanOrEqual(-90);
  expect(latDeg).toBeLessThanOrEqual(90);
}

describe("surfaceSpec", () => {
  it("is deterministic for a given body + seed", () => {
    const a = surfaceSpec("Earth", 42);
    const b = surfaceSpec("Earth", 42);
    expect(a).toEqual(b);
  });

  it("produces different jitter for different seeds", () => {
    const a = surfaceSpec("Earth", 1);
    const b = surfaceSpec("Earth", 2);
    expect(a).not.toEqual(b);
  });

  it("never throws and every known body has a non-empty palette", () => {
    for (const name of KNOWN_BODIES) {
      expect(() => surfaceSpec(name, 7)).not.toThrow();
      const spec = surfaceSpec(name, 7);
      expect(spec.palette.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a flat single-color spec for an unknown body", () => {
    const spec = surfaceSpec("Pluto", 1, "#abcdef");
    expect(spec.kind).toBe("flat");
    expect(spec.palette).toEqual(["#abcdef"]);
    expect(spec.bands).toBeUndefined();
    expect(spec.blobs).toBeUndefined();
    expect(spec.craters).toBeUndefined();
  });

  it("unknown body without a fallback color still returns a valid, non-throwing spec", () => {
    expect(() => surfaceSpec("Xyzzy", 1)).not.toThrow();
    const spec = surfaceSpec("Xyzzy", 1);
    expect(spec.kind).toBe("flat");
    expect(spec.palette.length).toBeGreaterThan(0);
  });

  it("Jupiter: banded, 6 bands, 4-color palette, wobbleAmp in 2-4 degrees", () => {
    const spec = surfaceSpec("Jupiter", 3);
    expect(spec.kind).toBe("banded");
    expect(spec.palette).toEqual(["#d9a066", "#b5764a", "#e8c99a", "#c98a5e"]);
    expect(spec.bands).toHaveLength(6);
    for (const band of spec.bands!) {
      expect(band.wobbleAmpDeg).toBeGreaterThanOrEqual(2);
      expect(band.wobbleAmpDeg).toBeLessThanOrEqual(4);
      checkLatRange(band.latStartDeg);
      checkLatRange(band.latEndDeg);
      expect(band.latStartDeg).toBeLessThan(band.latEndDeg);
      expect(band.colorIndex).toBeGreaterThanOrEqual(0);
      expect(band.colorIndex).toBeLessThan(spec.palette.length);
    }
  });

  it("Saturn: banded, 5 gentler bands, 3-color palette", () => {
    const spec = surfaceSpec("Saturn", 4);
    expect(spec.kind).toBe("banded");
    expect(spec.palette).toEqual(["#e0c088", "#caa86e", "#eed9ac"]);
    expect(spec.bands).toHaveLength(5);
  });

  it("Venus: banded, 3 soft bands, 2-color palette", () => {
    const spec = surfaceSpec("Venus", 5);
    expect(spec.kind).toBe("banded");
    expect(spec.palette).toEqual(["#e8c56a", "#d9b055"]);
    expect(spec.bands).toHaveLength(3);
  });

  it("Neptune and Uranus: icegiant, 2 bands, distinct 2-color palettes", () => {
    const neptune = surfaceSpec("Neptune", 6);
    const uranus = surfaceSpec("Uranus", 6);
    expect(neptune.kind).toBe("icegiant");
    expect(uranus.kind).toBe("icegiant");
    expect(neptune.bands).toHaveLength(2);
    expect(uranus.bands).toHaveLength(2);
    expect(neptune.palette).toEqual(["#4f6fd9", "#3a55b8"]);
    expect(uranus.palette).toEqual(["#7fd0d9", "#63b8c4"]);
  });

  it("Earth: continents, 7 blobs in 12-28 degree radius, polar caps at 68 degrees", () => {
    const spec = surfaceSpec("Earth", 8);
    expect(spec.kind).toBe("continents");
    expect(spec.palette).toEqual(["#3f7fd0", "#4faf5f", "#ffffff"]);
    expect(spec.blobs).toHaveLength(7);
    for (const blob of spec.blobs!) {
      expect(blob.radiusDeg).toBeGreaterThanOrEqual(12);
      expect(blob.radiusDeg).toBeLessThanOrEqual(28);
      checkLatRange(blob.latDeg);
      expect(blob.lonDeg).toBeGreaterThanOrEqual(0);
      expect(blob.lonDeg).toBeLessThan(360);
    }
    expect(spec.polarCaps).toEqual({ latDeg: 68, color: "#ffffff" });
  });

  it("Mars: continents variant, 5 splotches on rust, small caps at 76 degrees", () => {
    const spec = surfaceSpec("Mars", 9);
    expect(spec.kind).toBe("continents");
    expect(spec.palette).toEqual(["#c96a3f", "#a24f2e", "#f0e0d0"]);
    expect(spec.blobs).toHaveLength(5);
    expect(spec.polarCaps).toEqual({ latDeg: 76, color: "#f0e0d0" });
  });

  it("Mercury: cratered, 10 craters in 3-9 degree radius", () => {
    const spec = surfaceSpec("Mercury", 10);
    expect(spec.kind).toBe("cratered");
    expect(spec.palette).toEqual(["#9a8f85", "#7d736b"]);
    expect(spec.craters).toHaveLength(10);
    for (const crater of spec.craters!) {
      expect(crater.radiusDeg).toBeGreaterThanOrEqual(3);
      expect(crater.radiusDeg).toBeLessThanOrEqual(9);
      checkLatRange(crater.latDeg);
      expect(crater.lonDeg).toBeGreaterThanOrEqual(0);
      expect(crater.lonDeg).toBeLessThan(360);
    }
  });

  it("Moon: cratered, 12 craters", () => {
    const spec = surfaceSpec("Moon", 11);
    expect(spec.kind).toBe("cratered");
    expect(spec.palette).toEqual(["#b8b4ae", "#948f89"]);
    expect(spec.craters).toHaveLength(12);
  });
});
