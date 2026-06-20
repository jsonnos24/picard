export interface HudState {
  phase: string;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  fuelFraction: number;
  throttle: number;
  warning: string | null;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + " km";
  return n.toFixed(0) + " m";
}

export class HUD {
  private readonly el: HTMLDivElement;
  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "hud";
    root.appendChild(this.el);
  }

  update(s: HudState): void {
    this.el.innerHTML =
      `<div class="row">PHASE <b>${s.phase}</b></div>` +
      `<div class="row">ALT <b>${fmt(s.altitude)}</b></div>` +
      `<div class="row">SPD <b>${s.speed.toFixed(0)} m/s</b></div>` +
      `<div class="row">V/S <b>${s.verticalSpeed.toFixed(1)} m/s</b></div>` +
      `<div class="row">FUEL <b>${(s.fuelFraction * 100).toFixed(0)}%</b></div>` +
      `<div class="row">THR <b>${(s.throttle * 100).toFixed(0)}%</b></div>` +
      (s.warning ? `<div class="row warn">${s.warning}</div>` : "");
  }
}
