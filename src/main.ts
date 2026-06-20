import { Renderer } from "./render/Renderer";
import { createBodies, updateBodies } from "./render/scene/bodies";
import { createSolarSystem } from "./sim/Body";
import { createFloatingOrigin } from "./sim/FloatingOrigin";
import { Vec3 } from "./sim/Vec3";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
window.addEventListener("resize", () => renderer.resize());

const bodies = createSolarSystem();
const views = createBodies(renderer.scene, bodies);
const fo = createFloatingOrigin();

// Park the camera just above Earth's surface looking toward the Moon (+x).
const earth = bodies[0];
fo.offset = new Vec3(0, earth.radius + 2e6, 0); // pretend the player is here
renderer.camera.position.set(0, 0, 0);
renderer.camera.lookAt(bodies[1].position.x, 0, 0);

function loop(): void {
  updateBodies(views, fo);
  renderer.render();
  requestAnimationFrame(loop);
}
loop();
