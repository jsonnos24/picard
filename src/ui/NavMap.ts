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

  constructor(root: HTMLElement, private readonly bodies: Body[]) {
    this.el = document.createElement("div");
    this.el.id = "navmap";
    this.el.innerHTML = `<div class="title">NAV MAP — click a body to target</div>`;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 480;
    this.canvas.height = 360;
    this.el.appendChild(this.canvas);
    root.appendChild(this.el);
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("click", (e) => this.onClick(e));
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

  private worldToMap(x: number): { px: number; py: number } {
    // Map the Earth-Moon line (0..moon.x) across the canvas width with margins.
    const moonX = this.bodies[1].position.x;
    const margin = 60;
    const px = margin + (x / moonX) * (this.canvas.width - 2 * margin);
    return { px, py: this.canvas.height / 2 };
  }

  private draw(): void {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hit.length = 0;
    for (const b of this.bodies) {
      const { px, py } = this.worldToMap(b.position.x);
      c.fillStyle = b.name === this.target ? "#6f6" : "#9cf";
      c.beginPath();
      c.arc(px, py, b.name === "Earth" ? 14 : 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#9cf";
      c.font = "11px monospace";
      c.fillText(b.name, px - 12, py + 26);
      this.hit.push({ name: b.name, x: px, y: py });
    }
    // ship marker
    const s = this.worldToMap(this.shipPos.x);
    c.fillStyle = "#ff6";
    c.fillRect(s.px - 2, s.py - 2, 4, 4);
  }

  private onClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    for (const h of this.hit) {
      if (Math.hypot(h.x - x, h.y - y) < 20) {
        this.target = h.name;
        this.draw();
        return;
      }
    }
  }
}
