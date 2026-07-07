import { Game } from "./game/Game";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// The verify skill (.claude/skills/verify/SKILL.md) drives the game headlessly
// through this handle — window.__game.frame(t) with synthetic timestamps and
// dispatched KeyboardEvents. Keep it exposed; no code path may require a
// real user gesture.
(window as unknown as { __game: Game }).__game = game;
