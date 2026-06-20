export type Touchdown = "flying" | "landed" | "crash";

export const SAFE_VSPEED = 5; // m/s
export const SAFE_TILT = 0.1745; // ~10 deg

export function evaluateTouchdown(
  altitude: number,
  verticalSpeed: number,
  tilt: number,
  contactAltitude: number,
): Touchdown {
  if (altitude > contactAltitude) return "flying";
  if (verticalSpeed >= -SAFE_VSPEED && tilt <= SAFE_TILT) return "landed";
  return "crash";
}
