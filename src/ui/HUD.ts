export interface HudState {
  phase: string;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  fuelFraction: number;
  throttle: number;
  warning: string | null;
  timeScale: number; // 1 = real time; 2/4/6/8 = fast-forward
  missionSeconds: number; // simulated seconds since leaving Earth
  assistOn: boolean; // landing assist engaged
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

export class HUD {
  private readonly el: HTMLDivElement;
  private marker?: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "hud";
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
    this.marker.textContent = onScreen ? `⊕ ${label}` : `➤ ${label}`;
  }

  hideMarker(): void {
    if (this.marker) this.marker.textContent = "";
  }

  update(s: HudState): void {
    this.el.innerHTML =
      `<div class="row">PHASE <b>${s.phase}</b></div>` +
      `<div class="row">ALT <b>${fmt(s.altitude)}</b></div>` +
      `<div class="row">SPD <b>${s.speed.toFixed(0)} m/s</b></div>` +
      `<div class="row">V/S <b>${s.verticalSpeed.toFixed(1)} m/s</b></div>` +
      `<div class="row">FUEL <b>${(s.fuelFraction * 100).toFixed(0)}%</b></div>` +
      `<div class="row">THR <b>${(s.throttle * 100).toFixed(0)}%</b></div>` +
      `<div class="row">MET <b>${fmtMissionTime(s.missionSeconds)}</b></div>` +
      (s.timeScale > 1 ? `<div class="row warp">▶▶ WARP x${s.timeScale}</div>` : "") +
      (s.assistOn ? `<div class="row warp">🛬 LANDING ASSIST</div>` : "") +
      (s.warning ? `<div class="row warn">${s.warning}</div>` : "");
  }
}
