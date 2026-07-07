import { Body } from "../sim/Body";
import { Vec3 } from "../sim/Vec3";
import { projectSystem } from "./mapProjection";
import { etaSeconds } from "../sim/lightspeed";
import { bodyInfoLines } from "./format";

export class NavMap {
  private readonly el: HTMLDivElement; // full-screen backdrop; click = close
  private readonly panel: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly infoEl: HTMLDivElement;
  private readonly infoLines: HTMLDivElement;
  private readonly setCourseBtn: HTMLButtonElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private open = false;
  private target: string | null = null;
  private shipPos = new Vec3();
  private shipVel = new Vec3();
  private readonly hit: { name: string; x: number; y: number }[] = [];
  private dpr = 1;

  constructor(root: HTMLElement, private readonly bodies: Body[]) {
    this.el = document.createElement("div");
    this.el.id = "navmap";
    // Backdrop click (anywhere that isn't the panel) closes, same path as
    // the × button / Esc / M toggle.
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.close();
    });

    this.panel = document.createElement("div");
    this.panel.className = "panel";

    this.titleEl = document.createElement("div");
    this.titleEl.className = "title";
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.titleEl.textContent = coarse
      ? "NAV MAP — tap a body to target"
      : "NAV MAP — click a body to set course";

    this.closeBtn = document.createElement("button");
    this.closeBtn.className = "close";
    this.closeBtn.type = "button";
    this.closeBtn.textContent = "×";
    this.closeBtn.setAttribute("aria-label", "Close nav map");
    this.closeBtn.addEventListener("click", () => {
      this.close();
      this.closeBtn.blur(); // keep keyboard game input alive after the click
    });

    const paused = document.createElement("div");
    paused.className = "paused";
    paused.textContent = "PAUSED";

    this.canvas = document.createElement("canvas");
    this.canvas.width = 480;
    this.canvas.height = 360;
    this.canvas.addEventListener("click", (e) => this.onClick(e));

    this.infoEl = document.createElement("div");
    this.infoEl.className = "info hidden";
    this.infoLines = document.createElement("div");
    this.infoLines.className = "lines";
    this.setCourseBtn = document.createElement("button");
    this.setCourseBtn.className = "setcourse";
    this.setCourseBtn.type = "button";
    this.setCourseBtn.textContent = "SET COURSE";
    this.setCourseBtn.addEventListener("click", () => {
      // Tap-to-target already set the target; this just closes the map.
      this.close();
      this.setCourseBtn.blur();
    });
    this.infoEl.appendChild(this.infoLines);
    this.infoEl.appendChild(this.setCourseBtn);

    this.panel.appendChild(this.titleEl);
    this.panel.appendChild(this.closeBtn);
    this.panel.appendChild(paused);
    this.panel.appendChild(this.canvas);
    this.panel.appendChild(this.infoEl);
    this.el.appendChild(this.panel);
    root.appendChild(this.el);
    this.ctx = this.canvas.getContext("2d")!;
  }

  // Match the backing store to the CSS size × DPR so the map stays sharp on
  // any screen; runs each draw (cheap when nothing changed).
  private ensureSize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * this.dpr);
    const h = Math.round(this.canvas.clientHeight * this.dpr);
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  get isOpen(): boolean {
    return this.open;
  }
  get targetName(): string | null {
    return this.target;
  }
  setTarget(name: string): void {
    this.target = name;
  }

  // M toggles open/closed; the closing half of that routes through the exact
  // same close() as the × button, Esc, and the backdrop click, so there's
  // only ever one place that flips `open` off.
  toggle(): void {
    if (this.open) this.close();
    else this.openMap();
  }

  private openMap(): void {
    this.open = true;
    this.el.classList.add("open");
    this.renderInfo();
  }

  // Single close path — every affordance (× button, backdrop click, the M
  // toggle above, and main.ts's single-owner Esc router — Task 11) calls
  // this, so Game's open-state logic (this.navmap.isOpen) stays single-path
  // no matter what closed it.
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove("open");
  }

  update(shipPos: Vec3, shipVel: Vec3): void {
    this.shipPos = shipPos;
    this.shipVel = shipVel;
    if (this.open) {
      this.draw();
      this.renderInfo();
    }
  }

  private renderInfo(): void {
    const body = this.target ? this.bodies.find((b) => b.name === this.target) : undefined;
    if (!body) {
      if (!this.infoEl.classList.contains("hidden")) this.infoEl.classList.add("hidden");
      return;
    }
    const distanceM = body.position.sub(this.shipPos).length();
    const distToDrop = Math.max(0, distanceM - body.captureRadius);
    const etaSec = etaSeconds(distToDrop, this.shipVel.length());
    const text = bodyInfoLines(body, distanceM, etaSec).join("  ·  ");
    if (this.infoLines.textContent !== text) this.infoLines.textContent = text;
    if (this.infoEl.classList.contains("hidden")) this.infoEl.classList.remove("hidden");
  }

  private draw(): void {
    this.ensureSize();
    const c = this.ctx;
    const k = this.dpr;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    this.hit.length = 0;
    const proj = projectSystem(this.bodies, w, h, 28 * k, 24 * k);
    // Orbit rings first — they're what makes it read as a solar system.
    c.strokeStyle = "rgba(255, 217, 138, 0.18)";
    c.lineWidth = 1 * k;
    for (const r of proj.rings) {
      c.beginPath();
      c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const { px, py } = proj.points[i];
      const dotR = (b.kind === "star" ? 12 : b.kind === "moon" ? 4 : 7) * k;
      c.fillStyle =
        b.name === this.target ? "#7fd97f" : "#" + b.color.toString(16).padStart(6, "0");
      c.beginPath();
      c.arc(px, py, dotR, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffd98a";
      c.font = `${11 * k}px ui-monospace, monospace`;
      // Moons label above their dot so they don't collide with the planet's.
      const ly = b.kind === "moon" ? py - dotR - 6 * k : py + dotR + 14 * k;
      c.fillText(b.name, px - 12 * k, ly);
      this.hit.push({ name: b.name, x: px, y: py });
    }
    // ship marker
    const s = proj.project(this.shipPos.x, this.shipPos.z);
    c.fillStyle = "#ffd98a";
    c.fillRect(s.px - 3 * k, s.py - 3 * k, 6 * k, 6 * k);
  }

  private onClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    // Nearest body wins — Earth and the Moon overlap inside the tap radius,
    // and first-hit order made the Moon untappable.
    let best: string | null = null;
    let bestDist = 24 * this.dpr;
    for (const h of this.hit) {
      const dist = Math.hypot(h.x - x, h.y - y);
      if (dist < bestDist) {
        best = h.name;
        bestDist = dist;
      }
    }
    if (best) {
      this.target = best;
      this.draw();
      this.renderInfo();
    }
  }
}
