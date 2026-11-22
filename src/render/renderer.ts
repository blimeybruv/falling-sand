/**
 * Draws the world into a canvas through one ImageData buffer (one 32-bit write per cell).
 * The canvas is exactly one pixel per cell; CSS scales it up with `image-rendering: pixelated`.
 * Reads from the sim, never writes to it.
 */
import { AMBIENT_TEMP, CHARGE_ACTIVE, M, MATERIALS, SHADES, type World } from '../sim';

export interface RenderOptions {
  /** Colour cells by temperature instead of material. */
  heatView: boolean;
  /** Brush outline to draw, in grid cells, or null for none. */
  cursor: { x: number; y: number; radius: number } | null;
}

/** Gases fade out over their last FADE_FRAMES frames of life. */
const FADE_FRAMES = 40;
/** Clouds darken with depth: the top CLOUD_LIT cells stay bright, full grey CLOUD_DEEP cells further down. */
const CLOUD_LIT = 3;
const CLOUD_DEEP = 24;
const CLOUD_LEVELS = 16;
/** A gap of up to this many rows (minus one) inside a cloud still counts as the same cloud. */
const CLOUD_GAP = 6;

/** Sky colours: a sunny day, a clear night, and the warm tint of dawn and dusk (with Day and night on). */
const DAY_SKY = [26, 34, 54] as const;
const NIGHT_SKY = [5, 7, 16] as const;
const DUSK_SKY = [52, 30, 40] as const;
/** Stars come out at night in this top fraction of the grid (caves lower down stay starless). */
const STAR_ROWS = 0.45;

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
  /** Frames over which a material fades out at the end of its life (0: it doesn't). */
  private readonly fadeFrames: Uint8Array;
  private readonly flickers: Uint8Array;
  private readonly isGlow: Uint8Array;
  /** Colour while carrying a pulse: the bright head, and the fading tail behind it (per material). */
  private readonly chargeHead: Uint32Array;
  private readonly chargeTail: Uint32Array;
  /** Colour while lit (`life` above zero), for lamps; 0 for materials that don't glow when lit. */
  private readonly litLut: Uint32Array;
  /** Material colours at 30% brightness, the backdrop for the heat view. */
  private readonly dimLut: Uint32Array;
  /** 256 colours from cold (blue) through ambient (dark) to hot (red, yellow, white). */
  private readonly heatLut: Uint32Array;
  /**
   * For each cloud-shaded material (cloud, storm cloud), its colours from sunlit (level 0) to deep
   * in shadow (CLOUD_LEVELS - 1); cloudBase[m] is where material m's table starts (-1: not shaded).
   */
  private readonly cloudLut: Uint32Array;
  private readonly cloudBase: Int32Array;
  /** Per column while drawing: the row of the last cloud cell seen, and how deep into cloud it was. */
  private readonly cloudRow: Int32Array;
  private readonly cloudDepth: Uint16Array;
  /** Per cloud cell while drawing: how far it is from open sky above it (or to its left), for shading. */
  private readonly cloudDist: Uint8Array;
  private frame = 0;
  /** Air's own colour (Sun off, no day and night): the sky is tinted from this. */
  private readonly background: readonly [number, number, number];
  /** Drawn as sky: air, and materials coloured as air (invisible water vapour). */
  private readonly isAir: Uint8Array;
  /** Brightness (0: none) of the star at each cell, for clear nights. */
  private readonly stars: Uint8Array;
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
    this.fadeFrames = Uint8Array.from(MATERIALS, (d) => d.fadeFrames ?? (d.kind === 'gas' ? FADE_FRAMES : 0));
    this.flickers = Uint8Array.from(MATERIALS, (d) => (d.flicker ? 1 : 0));
    this.isGlow = Uint8Array.from(MATERIALS, (d) => (d.glow ? 1 : 0));
    // Electricity: a bright head where the pulse is, a warm glow fading behind it, unless the
    // material glows its own colour (neon).
    this.chargeHead = Uint32Array.from(MATERIALS, (d) => (d.chargeColour ? pack(...d.chargeColour) : pack(255, 252, 200)));
    this.litLut = Uint32Array.from(MATERIALS, (d) => (d.litColour ? pack(...d.litColour) : 0));
    this.chargeTail = Uint32Array.from(MATERIALS, (d) =>
      d.chargeColour ? pack(d.chargeColour[0] * 0.8, d.chargeColour[1] * 0.8, d.chargeColour[2] * 0.8) : pack(240, 200, 90),
    );
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
    const air = this.background;
    this.isAir = Uint8Array.from(MATERIALS, (d) =>
      d.id === M.Empty || (d.colourJitter === 0 && !d.colourEnd && d.colour.every((c, k) => c === air[k])) ? 1 : 0,
    );
    // A fixed scatter of stars (about one cell in 250), some brighter than others.
    this.stars = new Uint8Array(world.size);
    let s = 0x2545f491;
    const starCells = Math.floor(world.height * STAR_ROWS) * world.width;
    for (let i = 0; i < starCells; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      if ((s >>> 0) % 250 === 0) this.stars[i] = 90 + ((s >>> 8) % 160);
    }
    const shaded = MATERIALS.filter((d) => d.cloudShading);
    this.cloudBase = new Int32Array(MATERIALS.length).fill(-1);
    this.cloudLut = new Uint32Array(Math.max(1, shaded.length) * CLOUD_LEVELS * SHADES);
    shaded.forEach((d, k) => {
      const offset = k * CLOUD_LEVELS * SHADES;
      this.cloudBase[d.id] = offset;
      for (let level = 0; level < CLOUD_LEVELS; level++) {
        const t = level / (CLOUD_LEVELS - 1);
        for (let s = 0; s < SHADES; s++) {
          const j = d.id * SHADES + s;
          // Slightly bluer as it darkens: slate rather than plain grey.
          this.cloudLut[offset + level * SHADES + s] = pack(this.lutR[j] * (1 - 0.55 * t), this.lutG[j] * (1 - 0.53 * t), this.lutB[j] * (1 - 0.45 * t));
        }
      }
    });
    this.cloudRow = new Int32Array(world.width);
    this.cloudDepth = new Uint16Array(world.width);
    this.cloudDist = new Uint8Array(world.size);
  }

  render(world: World, options: RenderOptions = { heatView: false, cursor: null }): void {
    this.frame++;
    if (options.heatView) this.renderHeat(world);
    else this.renderMaterials(world);
    if (options.cursor) this.drawCursor(world, options.cursor);
    this.ctx.putImageData(this.image, 0, 0);
  }

  private renderMaterials(world: World): void {
    const { mat, shade, life, burn, charge, size, width } = world;
    const { pixels, lut, lutR, lutG, lutB, fadeFrames, flickers, isGlow, cloudLut, cloudBase, cloudRow, cloudDepth, cloudDist, chargeHead, chargeTail, litLut } = this;
    // Thick clouds are lit from above: they darken the deeper a cell is below the cloud's top.
    cloudRow.fill(-100);
    const glowShift = this.frame >> 3;
    const [bgR, bgG, bgB] = this.skyColour(world);
    const bg = pack(bgR, bgG, bgB);
    const { isAir, stars } = this;
    // Stars show on clear nights, fading in as it gets dark, and twinkle a little.
    const starlight = world.sun < -0.3 ? Math.min(1, (-world.sun - 0.3) / 0.5) : 0;
    const fireBase = M.Fire * SHADES;
    let seed = this.seed;

    for (let i = 0; i < size; i++) {
      const m = mat[i];
      if (isAir[m]) {
        if (starlight > 0 && stars[i] !== 0) {
          const twinkle = ((i * 7 + glowShift) & 7) === 0 ? 0.6 : 1;
          const v = stars[i] * starlight * twinkle;
          pixels[i] = pack(bgR + ((v - bgR) * 0.9) | 0, bgG + ((v - bgG) * 0.9) | 0, bgB + ((v * 1.05 - bgB) * 0.9) | 0);
        } else pixels[i] = bg;
        continue;
      }
      if (charge[i] !== 0) {
        pixels[i] = charge[i] >= CHARGE_ACTIVE ? chargeHead[m] : chargeTail[m];
        continue;
      }
      // Cheap xorshift for flicker; no Math.random in the hot loop.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;

      if (litLut[m] !== 0 && life[i] > 0) {
        pixels[i] = litLut[m];
      } else if (burn[i] > 0 && (seed & 3) !== 0) {
        pixels[i] = lut[fireBase + ((seed >>> 4) & (SHADES - 1))];
      } else if (m === M.Fire) {
        pixels[i] = lut[fireBase + ((seed >>> 4) & (SHADES - 1))];
      } else if (isGlow[m]) {
        pixels[i] = lut[m * SHADES + ((shade[i] + glowShift) & (SHADES - 1))];
      } else if (fadeFrames[m] && (life[i] < fadeFrames[m] || flickers[m])) {
        let a = Math.min(1, life[i] / fadeFrames[m]);
        if (flickers[m]) a *= 0.55 + ((seed >>> 8) & 255) / 567;
        const j = m * SHADES + shade[i];
        pixels[i] = pack(
          (bgR + (lutR[j] - bgR) * a) | 0,
          (bgG + (lutG[j] - bgG) * a) | 0,
          (bgB + (lutB[j] - bgB) * a) | 0,
        );
      } else if (cloudBase[m] >= 0) {
        const x = i % width;
        const y = (i - x) / width;
        // Lit from above: a cell's depth is one more than a blend of the depths above it and
        // diagonally above it, so light spreads softly down from every bump on top and the cloud
        // reads as rounded lobes rather than flat bands or vertical stripes. A small gap above (a
        // raindrop, a hole) doesn't count as open sky, or every hole would draw a bright streak.
        let up = 0;
        let upLeft = 0;
        let upRight = 0;
        if (y > 0) {
          const u = i - width;
          up = cloudBase[mat[u]] >= 0 ? cloudDist[u] : y - cloudRow[x] <= CLOUD_GAP ? cloudDepth[x] : 0;
          upLeft = x === 0 ? up : cloudBase[mat[u - 1]] >= 0 ? cloudDist[u - 1] : y - cloudRow[x - 1] <= CLOUD_GAP ? cloudDepth[x - 1] : 0;
          upRight = x === width - 1 ? up : cloudBase[mat[u + 1]] >= 0 ? cloudDist[u + 1] : y - cloudRow[x + 1] <= CLOUD_GAP ? cloudDepth[x + 1] : 0;
        }
        let depth = 1 + ((upLeft + 2 * up + upRight) >> 2);
        if (depth > 255) depth = 255;
        cloudDist[i] = depth;
        cloudDepth[x] = depth;
        cloudRow[x] = y;
        const level = depth <= CLOUD_LIT ? 0 : Math.min(CLOUD_LEVELS - 1, (((depth - CLOUD_LIT) * (CLOUD_LEVELS - 1)) / CLOUD_DEEP) | 0);
        pixels[i] = cloudLut[cloudBase[m] + level * SHADES + shade[i]];
      } else {
        pixels[i] = lut[m * SHADES + shade[i]];
      }
    }
    this.seed = seed;
  }

  /**
   * The colour of the sky (and of air everywhere): bluer in sunshine, near-black on a clear night,
   * and with Day and night on, warm around sunrise and sunset.
   */
  private skyColour(world: World): [number, number, number] {
    const sun = world.sun;
    const base = this.background;
    const to = sun >= 0 ? DAY_SKY : NIGHT_SKY;
    const a = Math.min(1, Math.abs(sun));
    let r = base[0] + (to[0] - base[0]) * a;
    let g = base[1] + (to[1] - base[1]) * a;
    let b = base[2] + (to[2] - base[2]) * a;
    if (world.dayLength > 0 && a < 0.4) {
      const d = (1 - a / 0.4) * 0.7;
      r += (DUSK_SKY[0] - r) * d;
      g += (DUSK_SKY[1] - g) * d;
      b += (DUSK_SKY[2] - b) * d;
    }
    return [r | 0, g | 0, b | 0];
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
