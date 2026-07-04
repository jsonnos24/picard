import { Game } from "./game/Game";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// Debug handle for playtest instrumentation (TODO: remove before release).
(window as unknown as { __game: Game }).__game = game;
