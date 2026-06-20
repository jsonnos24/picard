import * as THREE from "three";

export function createStarfield(): THREE.Points {
  const count = 3000;
  const radius = 5e8; // far shell, in metres
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // deterministic-ish spread using trig of the index (no Math.random needed)
    const theta = (i * 2.399963) % (Math.PI * 2); // golden-angle spiral
    const y = 1 - (i / (count - 1)) * 2; // -1..1
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5e6, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}
