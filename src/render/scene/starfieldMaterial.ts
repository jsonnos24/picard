import * as THREE from "three";

// Point size tuning, split out so bodies.ts (which assembles the geometry)
// doesn't need to know shader internals.
//
// SIZE_BASE mirrors the old flat PointsMaterial size (1.5e6) — small stars
// (relative size ~1.0) land close to the old look; medium/large scale up
// from there.
export const STAR_SIZE_BASE = 1.5e6;
// A fixed screen-scale constant for the perspective size falloff. Stars sit
// at a near-fixed distance (the starfield radius, 5e8) relative to any
// in-system camera move, so this doesn't need to track window resizes the
// way THREE.PointsMaterial's per-frame "scale" uniform does — the dominant
// term is 1/-mvPosition.z, which barely changes as the camera roams the
// solar system.
const RESOLUTION_SCALE = 400.0;

// Twinkle angular rate (radians/sec) — see brief: alpha oscillates with
// sin(uTime * rate + phase).
const TWINKLE_RATE = 1.5;

const vertexShader = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aAmp;

varying vec3 vColor;
varying float vPhase;
varying float vAmp;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vColor = aColor;
  vPhase = aPhase;
  vAmp = aAmp;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float atten = 1.0;
  if (isPerspectiveMatrix(projectionMatrix)) {
    atten = ${RESOLUTION_SCALE.toFixed(1)} / -mvPosition.z;
  }
  gl_PointSize = aSize * ${STAR_SIZE_BASE.toFixed(1)} * atten;

  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vPhase;
varying float vAmp;

uniform float uTime;

#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  // Circular, hard-ish edge (cartoon, not a soft photoreal glow): discard
  // outside the inscribed circle, tiny smoothstep right at the edge for AA.
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float edge = 1.0 - smoothstep(0.45, 0.5, d);

  float twinkle = 1.0 - vAmp + vAmp * (0.5 + 0.5 * sin(uTime * ${TWINKLE_RATE.toFixed(1)} + vPhase));

  vec4 diffuseColor = vec4(vColor, edge * twinkle);

  #include <logdepthbuf_fragment>

  vec3 outgoingLight = diffuseColor.rgb;
  gl_FragColor = vec4(outgoingLight, diffuseColor.a);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createStarfieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
}
