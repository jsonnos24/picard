import { Game } from "./game/Game";
import { loadSettings, serializeSettings, SETTINGS_KEY, Settings } from "./game/settings";
import { MuteButton } from "./ui/MuteButton";

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

new MuteButton(document.getElementById("ui")!, settings.muted, (muted) => {
  settings = { ...settings, muted };
  game.audio.setMuted(muted);
  localStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
});

// Backgrounding: suspend/resume the audio context with the tab's visibility
// rather than leaving it running (or leaving it suspended forever on return).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.audio.suspendForBackground();
  else game.audio.resumeFromBackground();
});
