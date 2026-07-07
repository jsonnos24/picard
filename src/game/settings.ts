// src/game/settings.ts
// Player-facing settings: persisted to localStorage by the caller (this
// module never touches storage itself — it only (de)serializes and
// tolerantly validates), so it stays pure and unit-testable in node.
export type Quality = "auto" | "high" | "low";

export interface Settings {
  muted: boolean;
  musicEnabled: boolean;
  sfxVolume: number; // 0..1
  quality: Quality;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  musicEnabled: true,
  sfxVolume: 1,
  quality: "auto",
  onboarded: false,
};

export const SETTINGS_KEY = "picard.settings.v1";

const QUALITIES: readonly Quality[] = ["auto", "high", "low"];

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Tolerant loader: any missing field, wrong type, or malformed JSON falls
// back to that field's default rather than throwing or losing the rest of
// an otherwise-valid settings object.
export function loadSettings(raw: string | null): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_SETTINGS };
  }
  const p = parsed as Record<string, unknown>;

  const muted = typeof p.muted === "boolean" ? p.muted : DEFAULT_SETTINGS.muted;
  const musicEnabled =
    typeof p.musicEnabled === "boolean" ? p.musicEnabled : DEFAULT_SETTINGS.musicEnabled;
  const sfxVolume =
    typeof p.sfxVolume === "number" && !Number.isNaN(p.sfxVolume)
      ? clamp01(p.sfxVolume)
      : DEFAULT_SETTINGS.sfxVolume;
  const quality =
    typeof p.quality === "string" && (QUALITIES as string[]).includes(p.quality)
      ? (p.quality as Quality)
      : DEFAULT_SETTINGS.quality;
  const onboarded = typeof p.onboarded === "boolean" ? p.onboarded : DEFAULT_SETTINGS.onboarded;

  return { muted, musicEnabled, sfxVolume, quality, onboarded };
}

export function serializeSettings(s: Settings): string {
  return JSON.stringify(s);
}
