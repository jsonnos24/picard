// Single source of truth for the game's name and tagline. Everything that
// shows this text (document.title, the splash screen, the manifest) reads
// from here — index.html can't import TS, so it carries static duplicate
// text for pre-JS paint, and main.ts overwrites it from these constants on
// load so this module still governs.
export const GAME_NAME = "PICARD";
export const TAGLINE = "a pocket tour of the solar system";
