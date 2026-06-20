import { Renderer } from "./render/Renderer";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
window.addEventListener("resize", () => renderer.resize());

function loop(): void {
  renderer.render();
  requestAnimationFrame(loop);
}
loop();
