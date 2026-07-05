import { Body } from "../sim/Body";
import { Vec3 } from "../sim/Vec3";

export class NavMap {
  private readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private open = false;
  private target: string | null = null;
  private shipPos = new Vec3();
  private readonly hit: { name: string; x: number; y: number }[] = [];
  private dpr = 1;

  constructor(root: HTMLElement, private readonly bodies: Body[]) {
    this.el = document.createElement("div");
    this.el.id = "navmap";
    this.el.innerHTML = `<div class="title">NAV MAP — tap a body to target</div>`;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 480;
    this.canvas.height = 360;
    this.el.appendChild(this.canvas);
    root.appendChild(this.el);
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("click", (e) => this.onClick(e));
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

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle("open", this.open);
  }

  update(shipPos: Vec3): void {
    this.shipPos = shipPos;
    if (this.open) this.draw();
  }

  // Top-down view of the ecliptic: world x/z fitted to the canvas with margins.
  private worldToMap(x: number, z: number): { px: number; py: number } {
    const margin = 40 * this.dpr;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const b of this.bodies) {
      minX = Math.min(minX, b.position.x);
      maxX = Math.max(maxX, b.position.x);
      minZ = Math.min(minZ, b.position.z);
      maxZ = Math.max(maxZ, b.position.z);
    }
    // One scale for both axes: the layout is a radial spread around the Sun,
    // and per-axis fitting would squash it into an ellipse.
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = Math.min(
      (this.canvas.width - 2 * margin) / spanX,
      (this.canvas.height - 2 * margin) / spanZ,
    );
    const px = this.canvas.width / 2 + (x - (minX + maxX) / 2) * scale;
    const py = this.canvas.height / 2 + (z - (minZ + maxZ) / 2) * scale;
    return { px, py };
  }

  private draw(): void {
    this.ensureSize();
    const c = this.ctx;
    const k = this.dpr;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hit.length = 0;
    for (const b of this.bodies) {
      const { px, py } = this.worldToMap(b.position.x, b.position.z);
      const dotR = (b.kind === "star" ? 12 : b.kind === "moon" ? 4 : 7) * k;
      c.fillStyle =
        b.name === this.target ? "#6f6" : "#" + b.color.toString(16).padStart(6, "0");
      c.beginPath();
      c.arc(px, py, dotR, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#9cf";
      c.font = `${11 * k}px monospace`;
      c.fillText(b.name, px - 12 * k, py + dotR + 14 * k);
      this.hit.push({ name: b.name, x: px, y: py });
    }
    // ship marker
    const s = this.worldToMap(this.shipPos.x, this.shipPos.z);
    c.fillStyle = "#ff6";
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
    }
  }
}
