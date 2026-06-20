import * as THREE from "three";

export interface MarkerScreen {
  onScreen: boolean;
  x: number;
  y: number;
}

export function projectMarker(worldPos: THREE.Vector3, camera: THREE.PerspectiveCamera): MarkerScreen {
  const v = worldPos.clone().project(camera); // NDC: x,y in [-1,1], z<1 in front
  // In THREE, a point in front of the camera has clip w>0; project() returns NDC
  // where points behind produce inverted coords. Detect front via view-space z.
  const viewPos = worldPos.clone().applyMatrix4(camera.matrixWorldInverse);
  const inFront = viewPos.z < 0;
  let x = (v.x + 1) / 2;
  let y = (1 - v.y) / 2; // flip Y for screen space
  const within = inFront && x >= 0 && x <= 1 && y >= 0 && y <= 1;
  if (!within) {
    if (!inFront) {
      // project direction onto screen edges using the view-space angle
      x = viewPos.x < 0 ? 0 : 1;
      y = 0.5;
    }
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
  }
  return { onScreen: within, x, y };
}
