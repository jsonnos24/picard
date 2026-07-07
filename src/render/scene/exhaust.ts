// src/render/scene/exhaust.ts
// Render glue for the engine flame: two flat-shaded cartoon cones (a
// two-step Ghibli-style flame — bright orange core, additive yellow
// flicker layer) attached to the ship's tail, plus a pool of shrinking
// line segments drifting behind the nozzle as a trail. Kinematics (length,
// flicker, emission count) come from src/game/feel/exhaust.ts; this file
// only turns that pure state into geometry.
import * as THREE from "three";
import { Vec3 } from "../../sim/Vec3";

// Ship-local Y (see ship.ts: CapsuleGeometry(radius=2, length=5) centered on
// the group origin spans y in [-4.5, 4.5]; the outline shell scales that by
// ~1.06-1.12). The nozzle sits just past the capsule's outline, between the
// three splayed legs.
export const NOZZLE_LOCAL_Y = -4.85;

const INNER_COLOR = 0xff9d3c;
const OUTER_COLOR = 0xffe08a;
const TRAIL_COLOR = 0xffc06a;
const TRAIL_COUNT = 60;
const TRAIL_LIFE = 0.6; // s
const TRAIL_SEG_LEN = 1.2; // m — initial streak length, shrinks to 0 as it fades
const TRAIL_SPEED_MIN = 6;
const TRAIL_SPEED_MAX = 14;
const VISIBLE_LENGTH_EPS = 0.02;

// Cone built apex-at-origin, extending down -Y as height grows — so scaling
// mesh.scale.y stretches the flame away from a fixed nozzle point instead of
// growing from its own center.
function apexCone(radius: number, height: number, segments = 10): THREE.ConeGeometry {
  const geo = new THREE.ConeGeometry(radius, height, segments);
  geo.translate(0, -height / 2, 0);
  return geo;
}

export interface Exhaust {
  // dt: frame time. length/flicker: this frame's ExhaustState fields.
  // nozzleWorldPos: world-space nozzle position (Game computes this from
  // ship position + orientation, since the trail lives in world space,
  // independent of the ship's transform). shipVelocity: for trail drift
  // direction. emitCount: trail particles to spawn this frame (from
  // exhaust.ts's takeEmits).
  update(
    dt: number,
    length: number,
    flicker: number,
    nozzleWorldPos: THREE.Vector3,
    shipVelocity: Vec3,
    emitCount: number,
  ): void;
}

export function createExhaust(parent: THREE.Group, scene: THREE.Scene): Exhaust {
  const flameGroup = new THREE.Group();
  flameGroup.position.set(0, NOZZLE_LOCAL_Y, 0);
  flameGroup.visible = false;
  parent.add(flameGroup);

  const inner = new THREE.Mesh(apexCone(0.9, 1, 10), new THREE.MeshBasicMaterial({ color: INNER_COLOR }));
  flameGroup.add(inner);

  const outer = new THREE.Mesh(
    apexCone(1.5, 1.3, 10),
    new THREE.MeshBasicMaterial({
      color: OUTER_COLOR,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  flameGroup.add(outer);

  // Trail pool: a ring buffer of line segments in world space (added to the
  // scene, not the ship, so an emitted puff of smoke stays put in the world
  // instead of dragging along with the ship). Each segment shrinks from
  // TRAIL_SEG_LEN to a point as it ages past TRAIL_LIFE, rather than fading
  // via a per-vertex alpha gradient — a hard-edged fade that suits the toon
  // identity and needs no shader work.
  const age = new Float32Array(TRAIL_COUNT).fill(Infinity);
  const baseX = new Float32Array(TRAIL_COUNT);
  const baseY = new Float32Array(TRAIL_COUNT);
  const baseZ = new Float32Array(TRAIL_COUNT);
  const dirX = new Float32Array(TRAIL_COUNT);
  const dirY = new Float32Array(TRAIL_COUNT);
  const dirZ = new Float32Array(TRAIL_COUNT);
  const speed = new Float32Array(TRAIL_COUNT);
  let cursor = 0;

  const verts = new Float32Array(TRAIL_COUNT * 6); // 2 points * 3 coords
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: TRAIL_COLOR,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trail = new THREE.LineSegments(geo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);

  const fallbackDir = new THREE.Vector3(0, -1, 0);
  const velDir = new THREE.Vector3();

  return {
    update(dt, length, flicker, nozzleWorldPos, shipVelocity, emitCount): void {
      const visible = length > VISIBLE_LENGTH_EPS;
      flameGroup.visible = visible;
      // Cockpit mode hides the whole ship exterior; mirror that onto the
      // world-space trail (the flame cones already inherit it as children).
      trail.visible = parent.visible;
      if (visible) {
        const s = length * (1 + (flicker - 1));
        inner.scale.set(1, s, 1);
        outer.scale.set(1, s * 1.15, 1);
        // Tiny cosmetic jitter — render glue only, not seeded (per the
        // brief, prng is for the pure modules; jitter here is per-particle
        // visual flutter with no gameplay consequence).
        flameGroup.rotation.x = (Math.random() - 0.5) * 0.06;
        flameGroup.rotation.z = (Math.random() - 0.5) * 0.06;
      }

      // Spawn new trail particles opposite the ship's velocity (falls back
      // to straight down when nearly stationary, e.g. idling on the pad).
      const speedMag = shipVelocity.length();
      if (speedMag > 0.5) {
        velDir.set(-shipVelocity.x, -shipVelocity.y, -shipVelocity.z).normalize();
      } else {
        velDir.copy(fallbackDir);
      }
      for (let i = 0; i < emitCount; i++) {
        const idx = cursor;
        cursor = (cursor + 1) % TRAIL_COUNT;
        age[idx] = 0;
        baseX[idx] = nozzleWorldPos.x;
        baseY[idx] = nozzleWorldPos.y;
        baseZ[idx] = nozzleWorldPos.z;
        const jitter = 0.15;
        dirX[idx] = velDir.x + (Math.random() - 0.5) * jitter;
        dirY[idx] = velDir.y + (Math.random() - 0.5) * jitter;
        dirZ[idx] = velDir.z + (Math.random() - 0.5) * jitter;
        const dLen = Math.hypot(dirX[idx], dirY[idx], dirZ[idx]) || 1;
        dirX[idx] /= dLen;
        dirY[idx] /= dLen;
        dirZ[idx] /= dLen;
        speed[idx] = TRAIL_SPEED_MIN + Math.random() * (TRAIL_SPEED_MAX - TRAIL_SPEED_MIN);
      }

      for (let i = 0; i < TRAIL_COUNT; i++) {
        const o = i * 6;
        if (age[i] >= TRAIL_LIFE) {
          verts[o] = verts[o + 3] = baseX[i];
          verts[o + 1] = verts[o + 4] = baseY[i];
          verts[o + 2] = verts[o + 5] = baseZ[i];
          continue;
        }
        age[i] += dt;
        const t = Math.min(1, age[i] / TRAIL_LIFE);
        const travelled = speed[i] * age[i];
        const hx = baseX[i] + dirX[i] * travelled;
        const hy = baseY[i] + dirY[i] * travelled;
        const hz = baseZ[i] + dirZ[i] * travelled;
        const segLen = TRAIL_SEG_LEN * (1 - t);
        verts[o] = hx;
        verts[o + 1] = hy;
        verts[o + 2] = hz;
        verts[o + 3] = hx - dirX[i] * segLen;
        verts[o + 4] = hy - dirY[i] * segLen;
        verts[o + 5] = hz - dirZ[i] * segLen;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
