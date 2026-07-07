import { Body, surfaceGravity } from "../sim/Body";
import { DEFAULT_BINDINGS, Intent } from "../sim/input/bindings";

// Pure formatting/logic for the nav map info strip and the desktop context
// chip. Zero DOM — every function here takes plain data and returns a
// string, so it's cheap to unit test and reused verbatim by the DOM glue.

// Earth's toy-scale surface gravity (see sim/Body.ts SPECS — gSurf: 10),
// not the real-world 9.8 m/s². "g" in this game means "relative to our Earth".
const EARTH_SURFACE_G = 10;

export function formatDistanceKm(m: number): string {
  const meters = Math.max(0, m);
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = Math.round(meters / 1000);
  return `${km.toLocaleString("en-US")} km`;
}

// "~32 s" under a minute (it's an estimate, hence the tilde); "1 m 12 s" from
// a minute up; "1 h 0 m" beyond an hour (shouldn't come up at toy-system
// scale, but a huge input must still render something sane, not NaN).
export function formatEta(sec: number): string {
  const total = Math.round(Math.max(0, sec));
  if (total < 60) return `~${total} s`;
  const totalMin = Math.floor(total / 60);
  const remSec = total % 60;
  if (totalMin < 60) return `${totalMin} m ${remSec} s`;
  const hours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  return `${hours} h ${remMin} m`;
}

// Relative to Earth's surface gravity, one decimal place: "0.4 g", "1.0 g".
export function formatGravity(ms2: number): string {
  const g = Math.max(0, ms2) / EARTH_SURFACE_G;
  return `${g.toFixed(1)} g`;
}

// Lines for the nav map's selected-body info strip: name, kind, distance
// from the ship, lightspeed ETA, surface gravity, landable or not.
export function bodyInfoLines(body: Body, distanceM: number, etaSec: number): string[] {
  return [
    body.name,
    body.kind,
    formatDistanceKm(distanceM),
    `ETA ${formatEta(etaSec)}`,
    formatGravity(surfaceGravity(body)),
    body.landable ? "Landable" : "Not landable",
  ];
}

function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  return code.toUpperCase(); // Space -> SPACE
}

// Intent -> key label, e.g. "lightspeed" -> "J", "slingHold" -> "SPACE".
// Reverse-looks-up DEFAULT_BINDINGS (code -> intents[]); every Intent is
// bound to at least one code, so the "?" fallback should be unreachable.
export function keyForIntent(intent: Intent): string {
  for (const [code, intents] of Object.entries(DEFAULT_BINDINGS)) {
    if (intents.includes(intent)) return codeLabel(code);
  }
  return "?";
}
