import { Body } from "../../src/sim/Body";
import { Vec3 } from "../../src/sim/Vec3";

// Real-scale Earth/Moon fixtures. The physics modules are scale-independent,
// so their tests keep exercising realistic values regardless of the toy-scale
// world data in createSolarSystem().
export function realEarth(): Body {
  return {
    name: "Earth",
    mass: 5.972e24,
    radius: 6.371e6,
    position: Vec3.zero(),
    atmosphere: { seaLevelDensity: 1.225, scaleHeight: 8500 },
    kind: "planet",
    landable: true,
    captureRadius: 6.371e6 * 6,
    color: 0x3f9bff,
  };
}

export function realMoon(): Body {
  return {
    name: "Moon",
    mass: 7.342e22,
    radius: 1.737e6,
    position: new Vec3(9.61e7, 0, 0),
    atmosphere: null,
    kind: "moon",
    landable: true,
    captureRadius: 1.737e6 * 6,
    color: 0xbfc5cc,
  };
}

export function realPair(): Body[] {
  return [realEarth(), realMoon()];
}
