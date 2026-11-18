/**
 * Draws the world into a canvas through one ImageData buffer (one 32-bit write per cell).
 * The canvas is exactly one pixel per cell; CSS scales it up with `image-rendering: pixelated`.
 * Reads from the sim, never writes to it.
 */
import { AMBIENT_TEMP, M, MATERIALS, SHADES, type World } from '../sim';

export interface RenderOptions {
  /** Colour cells by temperature instead of material. */
  heatView: boolean;
  /** Brush outline to draw, in grid cells, or null for none. */
  cursor: { x: number; y: number; radius: number } | null;
}

/** Gases fade out over their last FADE_FRAMES frames of life. */
const FADE_FRAMES = 40;

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x0a0b0c0d]).buffer)[0] === 0x0d;

function pack(r: number, g: number, b: number): number {
  return LITTLE_ENDIAN
    ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  /** Packed colour per (material, shade): lut[id * SHADES + shade]. */
  private readonly lut: Uint32Array;
  /** Unpacked channels, for blending gases into the background. */
  private readonly lutR: Uint8Array;
  private readonly lutG: Uint8Array;
  private readonly lutB: Uint8Array;
  private readonly isGas: Uint8Array;
  private readonly isGlow: Uint8Array;
  /** Material colours at 30% brightness, the backdrop for the heat view. */
  private readonly dimLut: Uint32Array;
  /** 256 colours from cold (blue) through ambient (dark) to hot (red, yellow, white). */
  private readonly heatLut: Uint32Array;
  private frame = 0;
  private readonly background: readonly [number, number, number];
  private seed = 0x9e3779b9;

  constructor(canvas: HTMLCanvasElement, world: World) {
    canvas.width = world.width;
    canvas.height = world.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.image = ctx.createImageData(world.width, world.height);
    this.pixels = new Uint32Array(this.image.data.buffer);

    const n = MATERIALS.length * SHADES;
    this.lut = new Uint32Array(n);
    this.lutR = new Uint8Array(n);
    this.lutG = new Uint8Array(n);
    this.lutB = new Uint8Array(n);
    for (const def of MATERIALS) {
      const end = def.colourEnd ?? def.colour;
      for (let s = 0; s < SHADES; s++) {
        const t = s / (SHADES - 1);
        // Brightness jitter, plus a blend towards colourEnd if the material has one.
        const k = 1 + def.colourJitter * (t * 2 - 1);
        const r = clamp255((def.colour[0] + (end[0] - def.colour[0]) * t) * k);
        const g = clamp255((def.colour[1] + (end[1] - def.colour[1]) * t) * k);
        const b = clamp255((def.colour[2] + (end[2] - def.colour[2]) * t) * k);
        const j = def.id * SHADES + s;
        this.lut[j] = pack(r, g, b);
        this.lutR[j] = r;
        this.lutG[j] = g;
        this.lutB[j] = b;
      }
    }
    this.isGas = Uint8Array.from(MATERIALS, (d) => (d.kind === 'gas' ? 1 : 0));
    this.isGlow = Uint8Array.from(MATERIALS, (d) => (d.glow ? 1 : 0));
    this.dimLut = this.lut.map((_, j) => pack(this.lutR[j] * 0.3, this.lutG[j] * 0.3, this.lutB[j] * 0.3));
    this.heatLut = new Uint32Array(256);
    for (let k = 0; k < 256; k++) {
      if (k < 64) {
        // cold: bright blue at k = 0 fading to dark at k = 63 (ambient)
        const a = 1 - k / 63;
        this.heatLut[k] = pack(20 + 60 * a, 40 + 120 * a, 60 + 195 * a);
      } else {
        // hot: dark red -> red -> orange -> yellow -> white
        const a = (k - 64) / 191;
        this.heatLut[k] = pack(60 + 195 * Math.min(1, a * 2), 20 + 235 * Math.max(0, Math.min(1, a * 2 - 0.5)), 20 + 235 * Math.max(0, a * 2 - 1.2));
      }
    }
    this.background = MATERIALS[M.Empty].colour;
  }

  render(world: World, options: RenderOptions = { heatView: false, cursor: null }): void {
    this.frame++;
    if (options.heatView) this.renderHeat(world);
    else this.renderMaterials(world);
    if (options.cursor) this.drawCursor(world, options.cursor);
    this.ctx.putImageData(this.image, 0, 0);
  }

  private renderMaterials(world: World): void {
    const { mat, shade, life, burn, size } = world;
    const { pixels, lut, lutR, lutG, lutB, isGas, isGlow } = this;
    const glowShift = this.frame >> 3;
    const [bgR, bgG, bgB] = this.background;
    const bg = pack(bgR, bgG, bgB);
    const fireBase = M.Fire * SHADES;
    let seed = this.seed;

    for (let i = 0; i < size; i++) {
      const m = mat[i];
      if (m === M.Empty) {
        pixels[i] = bg;
        continue;
      }
      // Cheap xorshift for flicker; no Math.random in the hot loop.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;

      if (burn[i] > 0 && (seed & 3) !== 0) {
        pixels[i] = lut[fireBase + ((seed >>> 4) & (SHADES - 1))];
      } else if (m === M.Fire) {
        pixels[i] = lut[fireBase + ((seed >>> 4) & (SHADES - 1))];
      } else if (isGlow[m]) {
        pixels[i] = lut[m * SHADES + ((shade[i] + glowShift) & (SHADES - 1))];
      } else if (isGas[m] && life[i] < FADE_FRAMES) {
        const a = life[i] / FADE_FRAMES;
        const j = m * SHADES + shade[i];
        pixels[i] = pack(
          (bgR + (lutR[j] - bgR) * a) | 0,
          (bgG + (lutG[j] - bgG) * a) | 0,
          (bgB + (lutB[j] - bgB) * a) | 0,
        );
      } else {
        pixels[i] = lut[m * SHADES + shade[i]];
      }
    }
    this.seed = seed;
  }

  private renderHeat(world: World): void {
    const { mat, shade, temp, size } = world;
    const { pixels, dimLut, heatLut } = this;
    for (let i = 0; i < size; i++) {
      const t = temp[i];
      const d = t - AMBIENT_TEMP;
      if (d > -1 && d < 1) {
        pixels[i] = dimLut[mat[i] * SHADES + shade[i]];
      } else if (d < 0) {
        pixels[i] = heatLut[Math.max(0, Math.round(63 + d * (63 / 50)))];
      } else {
        pixels[i] = heatLut[Math.min(255, 64 + Math.round(Math.sqrt(d / 1200) * 191))];
      }
    }
  }

  /** Lighten the cells on the brush's edge, so you can see where you're about to draw. */
  private drawCursor(world: World, c: { x: number; y: number; radius: number }): void {
    const data = this.image.data;
    const r = Math.max(0, Math.floor(c.radius));
    const inner = r * r - r;
    const outer = r * r + r;
    for (let dy = -r; dy <= r; dy++) {
      const y = c.y + dy;
      if (y < 0 || y >= world.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx;
        const d2 = dx * dx + dy * dy;
        if (x < 0 || x >= world.width || d2 > outer || (r > 0 && d2 <= inner)) continue;
        const p = (y * world.width + x) * 4;
        data[p] = data[p] * 0.45 + 140;
        data[p + 1] = data[p + 1] * 0.45 + 140;
        data[p + 2] = data[p + 2] * 0.45 + 140;
      }
    }
  }
}

/** CSS colour for a material's swatch in the palette. */
export function swatchColour(id: number): string {
  const def = MATERIALS[id];
  const [r, g, b] = def.colourEnd
    ? def.colour.map((c, k) => Math.round((c + def.colourEnd![k]) / 2))
    : def.colour;
  return `rgb(${r}, ${g}, ${b})`;
}
