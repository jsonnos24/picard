// On-screen controls legend. Shown by default; press H to hide/show.
const ROWS: [string, string][] = [
  ["W / S", "Throttle up / down"],
  ["↑ / ↓", "Pitch"],
  ["A / D", "Yaw"],
  ["Q / E", "Roll"],
  ["Space", "Engine on/off · Jump (on foot)"],
  ["Mouse", "Look (click to capture · Esc free)"],
  ["M", "Nav map — click a body to target"],
  ["J", "Warp to target"],
  ["L", "Landing assist (auto-descend)"],
  [". / ,", "Time-warp faster / slower"],
  ["C", "Camera / down-view"],
  ["F", "Exit / enter ship"],
  ["W A S D", "Walk (on foot)"],
  ["H", "Show / hide controls"],
];

export class Controls {
  private readonly el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "controls";
    this.el.innerHTML =
      `<div class="title">CONTROLS <span class="hint">H to hide</span></div>` +
      ROWS.map(([k, d]) => `<div class="crow"><b>${k}</b><span>${d}</span></div>`).join("");
    root.appendChild(this.el);
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyH") this.toggle();
    });
  }

  toggle(): void {
    this.el.classList.toggle("hidden");
  }
}
