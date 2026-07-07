// tests/game/settings.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  serializeSettings,
  type Settings,
} from "../../src/game/settings";

describe("settings", () => {
  it("exports the documented storage key", () => {
    expect(SETTINGS_KEY).toBe("picard.settings.v1");
  });

  it("loadSettings(null) returns the defaults", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a full settings object through serialize/load", () => {
    const s: Settings = { muted: true, musicEnabled: false, sfxVolume: 0.4, quality: "high", onboarded: true };
    expect(loadSettings(serializeSettings(s))).toEqual(s);
  });

  it("corrupt JSON falls back to defaults", () => {
    expect(loadSettings("{not json")).toEqual(DEFAULT_SETTINGS);
  });

  it("a partial object fills in missing fields with defaults", () => {
    const partial = JSON.stringify({ muted: true });
    expect(loadSettings(partial)).toEqual({ ...DEFAULT_SETTINGS, muted: true });
  });

  it("wrong-typed fields fall back to their default per-field", () => {
    const bad = JSON.stringify({
      muted: "yes",
      musicEnabled: 1,
      sfxVolume: "loud",
      quality: 42,
      onboarded: "true",
    });
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps sfxVolume into [0, 1]", () => {
    expect(loadSettings(JSON.stringify({ sfxVolume: 5 })).sfxVolume).toBe(1);
    expect(loadSettings(JSON.stringify({ sfxVolume: -3 })).sfxVolume).toBe(0);
  });

  it("an unknown quality value falls back to 'auto'", () => {
    expect(loadSettings(JSON.stringify({ quality: "ultra" })).quality).toBe("auto");
  });

  it("a JSON array (not an object) falls back to defaults", () => {
    expect(loadSettings("[1,2,3]")).toEqual(DEFAULT_SETTINGS);
  });
});
