// src/render/scene/atmosphereRim.ts
// Fresnel-quantized atmosphere rim: an inverted-hull shell slightly larger
// than the body, additive, alpha stepped to 2 flat bands (toon identity —
// no smooth photoreal fresnel gradient). Split out of bodies.ts per the
// Phase C2 brief's "small file under render/scene" allowance, since the
// shader needs the logdepthbuf chunks (see starfieldMaterial.ts for the
// pattern this mirrors) and is easiest to keep self-contained.

import * as THREE from "three";

// How much larger than the body's own radius the rim shell sits.
export const RIM_SCALE = 1.035;

const vertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;

  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;

varying vec3 vNormal;
varying vec3 vViewPosition;

#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  vec3 viewDir = normalize(vViewPosition);
  // Grazing angles (viewDir near-perpendicular to the normal) read as the
  // bright rim; face-on reads as fully transparent. Quantized to 2 flat
  // steps instead of a smooth gradient — hard-edged toon look, not a glow.
  float fresnel = 1.0 - abs(dot(viewDir, normalize(vNormal)));
  float alpha = fresnel >= 0.5 ? 0.55 : (fresnel >= 0.25 ? 0.25 : 0.0);

  vec4 diffuseColor = vec4(uColor, alpha);

  #include <logdepthbuf_fragment>

  gl_FragColor = diffuseColor;

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createAtmosphereRim(radius: number, colorHex: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius * RIM_SCALE, 32, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(colorHex) } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geo, mat);
}
