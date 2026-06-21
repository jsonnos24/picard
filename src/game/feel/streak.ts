// src/game/feel/streak.ts
export interface StreakParams { opacity: number; size: number; length: number }

export const STREAK_OPACITY_MAX = 0.85;
export const STREAK_SIZE_MAX = 3.5;     // point size multiplier ceiling
export const STREAK_LENGTH_MAX = 60;    // metres a particle stretches along velocity
export const STREAK_SPEED_REF = 2500;   // m/s where streaking saturates

export function streakParams(speed: number, boost: number): StreakParams {
  const b = Math.max(0, Math.min(1, boost));
  const k = Math.min(1, (1 - Math.exp(-Math.max(0, speed) / STREAK_SPEED_REF)) * (1 + 0.5 * b));
  const kk = Math.min(1, k);
  return {
    opacity: STREAK_OPACITY_MAX * kk,
    size: 1 + (STREAK_SIZE_MAX - 1) * kk,
    length: STREAK_LENGTH_MAX * kk,
  };
}
