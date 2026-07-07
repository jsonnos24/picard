// src/render/scene/planetTexture.ts
// Canvas painting glue: turns a pure SurfaceSpec (planetSurface.ts) into an
// equirectangular HTMLCanvasElement. No Three.js import here — bodies.ts
// wraps the result in a CanvasTexture and assigns it as `material.map`.
//
// Toon identity: hard-edged flat fills only, no gradients. Painting runs
// once at startup per body — never per frame.

import { SurfaceSpec, Band, Blob, Crater } from "../../game/feel/planetSurface";

const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 256;

// A band's wobbled edge can drift up to its own wobbleAmpDeg away from the
// nominal boundary, and its neighbor drifts independently — paint a
// generous overlap on every band fill so two independently-wobbling edges
// never reveal a sliver of the base fill between them.
const BAND_OVERLAP_PX = 12;

function lonToX(lonDeg: number, width: number): number {
  const wrapped = ((lonDeg % 360) + 360) % 360;
  return (wrapped / 360) * width;
}

function latToY(latDeg: number, height: number): number {
  return ((90 - latDeg) / 180) * height;
}

function degToPx(width: number): number {
  return width / 360; // == height / 180 for our fixed 2:1 aspect
}

function paintBands(ctx: CanvasRenderingContext2D, bands: Band[], palette: string[], width: number, height: number): void {
  for (const band of bands) {
    ctx.fillStyle = palette[band.colorIndex % palette.length];
    for (let x = 0; x < width; x++) {
      const lonRad = (x / width) * Math.PI * 2;
      const wobble = band.wobbleAmpDeg * Math.sin(band.wobbleFreq * lonRad);
      const yNorth = latToY(band.latEndDeg + wobble, height);
      const ySouth = latToY(band.latStartDeg + wobble, height);
      const top = Math.max(0, Math.floor(yNorth) - BAND_OVERLAP_PX);
      const bottom = Math.min(height, Math.ceil(ySouth) + BAND_OVERLAP_PX);
      if (bottom > top) ctx.fillRect(x, top, 1, bottom - top);
    }
  }
}

// Draws at (cx, cy) and, when the shape's x-extent crosses either seam,
// also at cx-width / cx+width so nothing is clipped at lon 0/360.
function withWrapCopies(cx: number, r: number, width: number, draw: (x: number) => void): void {
  draw(cx);
  if (cx - r < 0) draw(cx + width);
  if (cx + r > width) draw(cx - width);
}

function paintBlobs(ctx: CanvasRenderingContext2D, blobs: Blob[], palette: string[], width: number, height: number): void {
  const px = degToPx(width);
  for (const blob of blobs) {
    const cx = lonToX(blob.lonDeg, width);
    const cy = latToY(blob.latDeg, height);
    const r = blob.radiusDeg * px;
    ctx.fillStyle = palette[blob.colorIndex % palette.length];
    withWrapCopies(cx, r, width, (x) => {
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// A crater is painted as a darker ring: a solid disc of the darker palette
// tone with a smaller disc of the base tone punched out on top, leaving an
// annulus — a cartoon crater rim, both fills hard-edged flat colors.
function paintCraters(ctx: CanvasRenderingContext2D, craters: Crater[], palette: string[], width: number, height: number): void {
  const px = degToPx(width);
  const rimColor = palette[1] ?? palette[0];
  const floorColor = palette[0];
  for (const crater of craters) {
    const cx = lonToX(crater.lonDeg, width);
    const cy = latToY(crater.latDeg, height);
    const r = crater.radiusDeg * px;
    withWrapCopies(cx, r, width, (x) => {
      ctx.fillStyle = rimColor;
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = floorColor;
      ctx.beginPath();
      ctx.arc(x, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function paintPolarCaps(ctx: CanvasRenderingContext2D, latDeg: number, color: string, width: number, height: number): void {
  const yNorth = latToY(90, height);
  const yNorthCapEnd = latToY(latDeg, height);
  const ySouthCapStart = latToY(-latDeg, height);
  const ySouth = latToY(-90, height);
  ctx.fillStyle = color;
  ctx.fillRect(0, yNorth, width, Math.max(0, yNorthCapEnd - yNorth));
  ctx.fillRect(0, ySouthCapStart, width, Math.max(0, ySouth - ySouthCapStart));
}

export function paintSurface(spec: SurfaceSpec, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Base fill first — every other pass paints on top of this.
  ctx.fillStyle = spec.palette[0] ?? "#888888";
  ctx.fillRect(0, 0, width, height);

  if (spec.bands) paintBands(ctx, spec.bands, spec.palette, width, height);
  if (spec.blobs) paintBlobs(ctx, spec.blobs, spec.palette, width, height);
  if (spec.craters) paintCraters(ctx, spec.craters, spec.palette, width, height);
  if (spec.polarCaps) paintPolarCaps(ctx, spec.polarCaps.latDeg, spec.polarCaps.color, width, height);

  // Guarantee a seamless wrap at lon 0/360: force both edge columns to
  // match exactly (copy the lon=0 column onto the last column) so bilinear
  // sampling at the sphere's UV seam never shows a stripe.
  const edge = ctx.getImageData(0, 0, 1, height);
  ctx.putImageData(edge, width - 1, 0);

  return canvas;
}

// Saturn's ring: 5 alternating flat tones + 2 transparent gaps, radial
// (inner->outer maps to the canvas's vertical axis; RingGeometry's UV wraps
// its angular axis around the other, and every column here is identical so
// that axis has no seam to worry about). Alpha comes straight from the
// canvas — segments left unpainted stay fully transparent.
const RING_TONE_A = "#e8d9a8";
const RING_TONE_B = "#cbb68a";
const RING_TONE_C = "#a89468";

interface RingSegment {
  start: number; // [0, 1)
  end: number; // (start, 1]
  color: string | null; // null = transparent gap
}

const RING_SEGMENTS: RingSegment[] = [
  { start: 0.0, end: 0.16, color: RING_TONE_A },
  { start: 0.16, end: 0.22, color: null },
  { start: 0.22, end: 0.42, color: RING_TONE_B },
  { start: 0.42, end: 0.58, color: RING_TONE_C },
  { start: 0.58, end: 0.64, color: null },
  { start: 0.64, end: 0.84, color: RING_TONE_B },
  { start: 0.84, end: 1.0, color: RING_TONE_A },
];

export function paintRingTexture(width = 8, height = 256): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (const seg of RING_SEGMENTS) {
    if (!seg.color) continue;
    const y0 = seg.start * height;
    const y1 = seg.end * height;
    ctx.fillStyle = seg.color;
    ctx.fillRect(0, y0, width, y1 - y0);
  }
  return canvas;
}
