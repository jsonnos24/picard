import { Game } from "./game/Game";
import { loadSettings, serializeSettings, SETTINGS_KEY, Settings } from "./game/settings";
import { MuteButton } from "./ui/MuteButton";
import { Onboarding } from "./ui/Onboarding";
import { GAME_NAME, TAGLINE } from "./branding";

// index.html carries static duplicate text for pre-JS paint (title, splash
// wordmark/tagline) since it can't import TS. Re-assert it from the single
// source of truth here so branding.ts still governs.
document.title = GAME_NAME;
const splashTagline = document.querySelector<HTMLElement>("#splash .tagline");
if (splashTagline) splashTagline.textContent = TAGLINE;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// The verify skill (.claude/skills/verify/SKILL.md) drives the game headlessly
// through this handle — window.__game.frame(t) with synthetic timestamps and
// dispatched KeyboardEvents. Keep it exposed; no code path may require a
// real user gesture.
(window as unknown as { __game: Game }).__game = game;

// Settings: load once at startup and apply to the audio director; persisted
// back to localStorage whenever the player changes one (today: only the
// mute button — sfxVolume/musicEnabled have no UI yet, pre-E1 scope).
let settings: Settings = loadSettings(localStorage.getItem(SETTINGS_KEY));
game.audio.setMuted(settings.muted);
game.audio.setMusicEnabled(settings.musicEnabled);
game.audio.setMasterVolume(settings.sfxVolume);
game.setQualitySetting(settings.quality);

new MuteButton(document.getElementById("ui")!, settings.muted, (muted) => {
  settings = { ...settings, muted };
  game.audio.setMuted(muted);
  localStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
});

// First-run onboarding: shown once (never again once dismissed), after the
// splash below has faded. Persists onboarded on dismissal — via GOT IT, or
// the first meaningful game input the overlay itself detects.
game.setOnboarded(settings.onboarded);
const onboarding = new Onboarding(document.getElementById("ui")!, () => {
  settings = { ...settings, onboarded: true };
  localStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
  game.setOnboarded(true);
});

// Backgrounding: suspend/resume the audio context with the tab's visibility
// rather than leaving it running (or leaving it suspended forever on return).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.audio.suspendForBackground();
  else game.audio.resumeFromBackground();
});

// Splash: a purely cosmetic overlay above an already-running game (it never
// gates start()/audio — the game is constructed and driven exactly as
// above whether or not this element exists). Fades on first real input or
// after ~2.5s, whichever comes first, using real wall-clock time — the
// headless verify harness drives `game.frame(t)` with synthetic timestamps,
// which do not advance real time, so the timeout is deliberately independent
// of the simulation clock. Both a synthetic and a real keydown/pointerdown
// dismiss it (no isTrusted check), matching the verify harness's dispatched
// KeyboardEvents.
const splash = document.getElementById("splash");
if (splash) {
  let dismissed = false;
  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add("fade-out");
    window.removeEventListener("pointerdown", dismiss);
    window.removeEventListener("keydown", dismiss);
    window.setTimeout(() => {
      splash.remove();
      // Coordinate with onboarding: show it only after the splash is fully
      // gone, so the two overlays never stack.
      if (!settings.onboarded) onboarding.reveal();
    }, 320);
  };
  window.addEventListener("pointerdown", dismiss);
  window.addEventListener("keydown", dismiss);
  window.setTimeout(dismiss, 2500);
} else if (!settings.onboarded) {
  // No splash element (e.g. a stripped test harness) — fall back to a plain
  // delay so first-run players still get oriented.
  window.setTimeout(() => onboarding.reveal(), 3000);
}
