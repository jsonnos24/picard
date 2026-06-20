import { Game } from "./game/Game";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const game = new Game(canvas);
game.start();
