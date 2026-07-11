// src/render/scene/earthAtmosphere.ts
// Earth-only atmosphere visuals — a facade over three self-contained systems:
// a gradient sky dome, drifting clouds, and a distant flapping flock of birds.
// On the ground you get a beautiful blue sky, clouds you punch through on
// launch, and birds near the horizon; climbing to space (~3000 m) the whole
// thing fades away, revealing the navy background + starfield. Everything is
// procedural (no binary assets) and hard-gated off when not near Earth, so
// other planets and hidden tabs cost nothing.
import * as THREE from "three";
import { createEarthSky } from "./earthSky";
import { createEarthClouds } from "./earthClouds";
import { createEarthBirds } from "./earthBirds";

// Per-frame inputs, all already in floating-origin RENDER space (never world).
export interface AtmoCtx {
  isEarth: boolean; // focusPrimary.body.name === "Earth"
  altitude: number; // metres above the surface
  surfacePoint: THREE.Vector3; // the point on Earth directly below the ship/astronaut
  up: THREE.Vector3; // local up (body-center → ship), normalized
  cameraPos: THREE.Vector3; // render-space camera position (dome follows it)
  tSec: number; // monotonic seconds (flap/drift phase)
  dt: number; // seconds since last frame
}

export interface EarthAtmosphere {
  update(ctx: AtmoCtx): void;
}

export function createEarthAtmosphere(scene: THREE.Scene): EarthAtmosphere {
  const sky = createEarthSky(scene);
  const clouds = createEarthClouds(scene);
  const birds = createEarthBirds(scene);
  return {
    update(ctx: AtmoCtx): void {
      sky.update(ctx);
      clouds.update(ctx);
      birds.update(ctx);
    },
  };
}
