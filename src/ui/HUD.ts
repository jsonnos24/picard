export interface HudState {
  phase: string;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  throttle: number;
  warning: string | null;
  lightspeedEta: number | null; // seconds to the drop point while cruising, else null
  // Captured in a gravity ring; atTarget = it's the nav target's ring (arrival)
  sling: { winding: boolean; speed: number; aligned: boolean; atTarget: boolean } | null;
  missionSeconds: number; // simulated seconds since leaving Earth
  assistOn: boolean; // landing assist engaged
  hint: string | null; // context-sensitive "what do I do next" line (keyboard wording)
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + " km";
  return n.toFixed(0) + " m";
}

// Mission elapsed time as weeks/days/hours/min/sec, showing the two largest units.
export function fmtMissionTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const units: [number, string][] = [
    [604800, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
    [1, "s"],
  ];
  const parts: string[] = [];
  let rem = s;
  for (const [size, label] of units) {
    if (parts.length >= 2) break;
    if (rem >= size || parts.length > 0) {
      const v = Math.floor(rem / size);
      rem %= size;
      if (parts.length > 0 || v > 0) parts.push(`${v}${label}`);
    }
  }
  return "T+ " + (parts.length ? parts.join(" ") : "0s");
}

// Cached-element HUD: the DOM is built once and only textContent mutates (and
// only on change) — no per-frame innerHTML churn, which matters on phones.
export class HUD {
  private readonly el: HTMLDivElement;
  private marker?: HTMLDivElement;
  private readonly values = new Map<string, HTMLElement>();
  private readonly status = new Map<string, HTMLElement>();

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "hud";
    for (const label of ["PHASE", "ALT", "SPD", "V/S", "THR", "MET"]) {
      const row = document.createElement("div");
      row.className = "row";
      row.textContent = `${label} `;
      const val = document.createElement("b");
      row.appendChild(val);
      this.el.appendChild(row);
      this.values.set(label, val);
    }
    for (const [key, className] of [
      ["lightspeed", "row warp"],
      ["sling", "row warp"],
      ["assist", "row warp"],
      ["warning", "row warn"],
      ["hint", "row hint"],
    ] as const) {
      const row = document.createElement("div");
      row.className = className;
      row.style.display = "none";
      this.el.appendChild(row);
      this.status.set(key, row);
    }
    root.appendChild(this.el);
  }

  setMarker(label: string, x: number, y: number, onScreen: boolean): void {
    if (!this.marker) {
      this.marker = document.createElement("div");
      this.marker.className = "marker";
      this.el.parentElement!.appendChild(this.marker);
    }
    this.marker.style.left = `${x * 100}%`;
    this.marker.style.top = `${y * 100}%`;
    const text = onScreen ? `⊕ ${label}` : `➤ ${label}`;
    if (this.marker.textContent !== text) this.marker.textContent = text;
  }

  hideMarker(): void {
    if (this.marker && this.marker.textContent !== "") this.marker.textContent = "";
  }

  private setValue(label: string, text: string): void {
    const el = this.values.get(label)!;
    if (el.textContent !== text) el.textContent = text;
  }

  private setStatus(key: string, text: string | null): void {
    const el = this.status.get(key)!;
    const show = text !== null;
    const display = show ? "" : "none";
    if (el.style.display !== display) el.style.display = display;
    if (show && el.textContent !== text) el.textContent = text;
  }

  update(s: HudState): void {
    this.setValue("PHASE", s.phase);
    this.setValue("ALT", fmt(s.altitude));
    this.setValue("SPD", `${s.speed.toFixed(0)} m/s`);
    this.setValue("V/S", `${s.verticalSpeed.toFixed(1)} m/s`);
    this.setValue("THR", `${(s.throttle * 100).toFixed(0)}%`);
    this.setValue("MET", fmtMissionTime(s.missionSeconds));
    this.setStatus(
      "lightspeed",
      s.lightspeedEta !== null ? `▶▶ LIGHTSPEED · ${Math.ceil(s.lightspeedEta)}s` : null,
    );
    this.setStatus(
      "sling",
      s.sling
        ? s.sling.atTarget && !s.sling.winding
          ? `⭗ TARGET REACHED — LAND, or swing on`
          : `⭗ ${s.sling.winding ? "SWINGING" : "CAPTURED — HOLD TO SWING"} · ${(
              s.sling.speed / 1000
            ).toFixed(1)} km/s${s.sling.aligned ? " · ◎ RELEASE!" : ""}`
        : null,
    );
    this.setStatus("assist", s.assistOn ? "🛬 LANDING ASSIST" : null);
    this.setStatus("warning", s.warning);
    this.setStatus("hint", s.hint ? `▶ ${s.hint}` : null);
  }
}
