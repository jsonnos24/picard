// src/game/feel/stick.ts
// Pure math for the anchored touch thumbstick: deflection-from-anchor with an
// 8px dead-zone (kills accidental micro-jitter on touch-down) rescaled
// smoothly from the dead-zone edge out to maxR (80px = the pre-existing full
// deflection radius), then clamped to a unit vector beyond that. No DOM, no
// state — TouchControls.ts feeds it live pointer coordinates each move.
export interface StickVector {
  x: number;
  y: number;
  active: boolean; // false while inside the dead-zone (steer output should be 0)
}

export function stickVector(
  anchorX: number,
  anchorY: number,
  curX: number,
  curY: number,
  maxR = 80,
  deadR = 8,
): StickVector {
  const dx = curX - anchorX;
  const dy = curY - anchorY;
  const len = Math.hypot(dx, dy);
  if (len === 0 || len < deadR) return { x: 0, y: 0, active: false };

  const scale = Math.min(1, (len - deadR) / (maxR - deadR));
  return { x: (dx / len) * scale, y: (dy / len) * scale, active: true };
}
