import * as THREE from "three";
import { Body } from "../../sim/Body";
import { toRender, FloatingOrigin } from "../../sim/FloatingOrigin";

// Visible gravity bubbles: a faint translucent shell at each body's capture
// radius plus a dashed great-circle in the ecliptic, so the slingshot range
// reads as a place you can fly into. The captured body's bubble pulses.

interface RingView {
  body: Body;
  group: THREE.Group;
  shellMat: THREE.MeshBasicMaterial;
  baseOpacity: number;
}

export function createGravityRings(
  scene: THREE.Scene,
  bodies: Body[],
): { update(fo: FloatingOrigin, capturedName: string | null, t: number): void } {
  const views: RingView[] = bodies.map((body) => {
    const group = new THREE.Group();
    const danger = !body.landable; // the Sun: hot, keep-out styling
    const color = danger ? 0xff5533 : 0x66bbff;
    const baseOpacity = danger ? 0.1 : 0.06;

    const shellMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: baseOpacity,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(body.captureRadius, 32, 24), shellMat);
    group.add(shell);

    // Dashed equator circle marking the bubble edge.
    const SEGMENTS = 128;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.cos(a) * body.captureRadius, 0, Math.sin(a) * body.captureRadius),
      );
    }
    const circleGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const circleMat = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: danger ? 0.5 : 0.35,
      dashSize: body.captureRadius * 0.08,
      gapSize: body.captureRadius * 0.05,
      depthWrite: false,
    });
    const circle = new THREE.Line(circleGeo, circleMat);
    circle.computeLineDistances();
    group.add(circle);

    scene.add(group);
    return { body, group, shellMat, baseOpacity };
  });

  return {
    update(fo: FloatingOrigin, capturedName: string | null, t: number): void {
      for (const v of views) {
        const p = toRender(fo, v.body.position);
        v.group.position.set(p.x, p.y, p.z);
        v.shellMat.opacity =
          v.body.name === capturedName
            ? v.baseOpacity + 0.08 + 0.05 * Math.sin(t * 6) // captured: brighter, pulsing
            : v.baseOpacity;
      }
    },
  };
}
