/**
 * The simulation grid and its update loop. Pure logic: no DOM, no rendering, no input.
 *
 * Each cell is an index i = y * width + x into parallel typed arrays:
 *   mat   material id (see ids.ts)
 *   shade colour variation, 0..SHADES-1, picked when the particle is created and carried with it
 *   life  remaining lifetime in frames, for short-lived materials (fire, smoke, steam)
 *   burn  > 0 while the cell is burning: frames left before it burns out (or, for explosives, the fuse)
 *   vel   consecutive frames spent falling; drives acceleration and nitroglycerin's impact trigger
 *
 * The grid is updated bottom-up, alternating left-to-right and right-to-left each frame, and every
 * cell moves at most once per frame (tracked with `stamp`).
 */
import { M, type MaterialId } from './ids';
import { MATERIALS, MAX_BLAST_RADIUS, MAX_EXPLOSIONS_PER_FRAME, type MaterialDef } from './materials';
import { Rng } from './rng';

/** Number of colour variations per material. */
export const SHADES = 16;
/** A falling particle moves at most this many cells per frame. */
const MAX_FALL_STEPS = 4;

/** density[id] and fluid[id] (empty, liquid or gas: can be displaced by a heavier mover). */
const DENSITY = Float32Array.from(MATERIALS, (d) => d.density);
const FLUID = Uint8Array.from(MATERIALS, (d) => (d.kind === 'empty' || d.kind === 'liquid' || d.kind === 'gas' ? 1 : 0));
const FLAMMABLE = Uint8Array.from(MATERIALS, (d) => (d.flammability > 0 ? 1 : 0));

const N4: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
const N8: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export class World {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly mat: Uint8Array;
  readonly shade: Uint8Array;
  readonly life: Int16Array;
  readonly burn: Int16Array;
  readonly vel: Uint8Array;
  readonly rng: Rng;
  /** Frames simulated so far. */
  frame = 0;
  /** Frame number in which each cell last moved or was created; such cells are skipped. */
  private readonly stamp: Uint32Array;
  private explosionsThisFrame = 0;

  constructor(width: number, height: number, seed?: number) {
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.mat = new Uint8Array(this.size);
    this.shade = new Uint8Array(this.size);
    this.life = new Int16Array(this.size);
    this.burn = new Int16Array(this.size);
    this.vel = new Uint8Array(this.size);
    this.stamp = new Uint32Array(this.size);
    this.rng = new Rng(seed);
  }

  // ---------------------------------------------------------------- cell access

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  /** Material at (x, y). Outside the grid counts as Stone, i.e. a solid wall. */
  get(x: number, y: number): MaterialId {
    return this.inBounds(x, y) ? (this.mat[y * this.width + x] as MaterialId) : M.Stone;
  }

  /** True for walls, static materials and powders (things fluids can't pass through). */
  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    const kind = MATERIALS[this.mat[y * this.width + x]].kind;
    return kind === 'static' || kind === 'powder';
  }

  /** Place a fresh particle at (x, y). Ignored outside the grid. */
  set(x: number, y: number, m: MaterialId): void {
    if (this.inBounds(x, y)) this.setCell(y * this.width + x, m);
  }

  /**
   * Replace cell i with a fresh particle of material m (new colour shade and lifetime, not burning).
   * The new particle does not act until the next frame.
   */
  setCell(i: number, m: MaterialId): void {
    const def = MATERIALS[m];
    this.mat[i] = m;
    this.shade[i] = (this.rng.next() * SHADES) | 0;
    this.life[i] = def.lifetime ? this.rng.int(def.lifetime[0], def.lifetime[1]) : 0;
    this.burn[i] = 0;
    this.vel[i] = 0;
    this.stamp[i] = this.frame;
  }

  /** Swap two cells (all their state) and mark both as moved this frame. */
  swap(a: number, b: number): void {
    const { mat, shade, life, burn, vel } = this;
    let t: number;
    t = mat[a]; mat[a] = mat[b]; mat[b] = t;
    t = shade[a]; shade[a] = shade[b]; shade[b] = t;
    t = life[a]; life[a] = life[b]; life[b] = t;
    t = burn[a]; burn[a] = burn[b]; burn[b] = t;
    t = vel[a]; vel[a] = vel[b]; vel[b] = t;
    this.stamp[a] = this.frame;
    this.stamp[b] = this.frame;
  }

  clear(): void {
    this.mat.fill(0);
    this.life.fill(0);
    this.burn.fill(0);
    this.vel.fill(0);
  }

  /** Number of cells holding material m. */
  count(m: MaterialId): number {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.mat[i] === m) n++;
    return n;
  }

  // ---------------------------------------------------------------- drawing

  /**
   * Brush: fill a disc with material m. Particles only go into empty cells; Empty (the eraser)
   * clears everything; Fire also sets flammable cells alight. Loose materials are scattered a
   * little so they look poured rather than stamped.
   */
  paint(cx: number, cy: number, radius: number, m: MaterialId): void {
    const r = Math.max(0, Math.floor(radius));
    const r2 = r * r + r;
    const kind = MATERIALS[m].kind;
    const scatter = r === 0 || kind === 'static' ? 1 : 0.5;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= this.width || dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        const t = this.mat[i];
        if (m === M.Empty) {
          if (t !== M.Empty) this.setCell(i, M.Empty);
        } else if (t === M.Empty) {
          if (this.rng.chance(scatter)) this.setCell(i, m);
        } else if (m === M.Fire) {
          this.ignite(i);
        }
      }
    }
  }

  /** Paint along a line, for smooth strokes when the pointer moves fast. */
  paintLine(x0: number, y0: number, x1: number, y1: number, radius: number, m: MaterialId): void {
    const dist = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const stride = Math.max(1, Math.floor(radius / 2));
    const steps = Math.max(1, Math.ceil(dist / stride));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.paint(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), radius, m);
    }
  }

  // ---------------------------------------------------------------- fire

  /** Set cell i alight if it is flammable and not already burning. Returns true if it caught. */
  ignite(i: number): boolean {
    const def = MATERIALS[this.mat[i]];
    if (def.flammability <= 0 || this.burn[i] > 0) return false;
    // Explosives get a short fuse instead of a burn time.
    this.burn[i] = def.explosive ? this.rng.int(1, 4) : this.rng.int(def.burnTime[0], def.burnTime[1]);
    return true;
  }

  /** Give each flammable neighbour of (x, y) its own chance (its flammability) of catching fire. */
  igniteNeighbours(x: number, y: number): void {
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const n = ny * this.width + nx;
      const t = this.mat[n];
      if (FLAMMABLE[t] && this.burn[n] === 0 && this.rng.chance(MATERIALS[t].flammability)) this.ignite(n);
    }
  }

  // ---------------------------------------------------------------- explosions

  /**
   * Blast at (cx, cy). Everything destructible within `radius` (capped at MAX_BLAST_RADIUS) is
   * cleared, some of it to fire. In a ring beyond that, loose particles are thrown outwards,
   * flammable ones may catch, and other explosives get a short fuse (so chains spread over several
   * frames instead of recursing). Returns false, doing nothing, if this frame's explosion budget is
   * spent; the caller should try again next frame.
   */
  explode(cx: number, cy: number, radius: number): boolean {
    if (this.explosionsThisFrame >= MAX_EXPLOSIONS_PER_FRAME) return false;
    this.explosionsThisFrame++;

    const r = Math.max(1, Math.min(Math.round(radius), MAX_BLAST_RADIUS));
    const outer = r + Math.ceil(r * 0.75);
    const r2 = r * r;
    const o2 = outer * outer;
    const ring: [number, number, number][] = [];

    for (let dy = -outer; dy <= outer; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.height) continue;
      for (let dx = -outer; dx <= outer; dx++) {
        const x = cx + dx;
        const d2 = dx * dx + dy * dy;
        if (x < 0 || x >= this.width || d2 > o2) continue;
        const i = y * this.width + x;
        const t = this.mat[i];
        if (d2 <= r2) {
          if (!MATERIALS[t].indestructible) this.setCell(i, this.rng.chance(0.25) ? M.Fire : M.Empty);
        } else if (t !== M.Empty) {
          ring.push([d2, dx, dy]);
        }
      }
    }

    // Outermost first, so particles further out make room for the ones behind them.
    ring.sort((a, b) => b[0] - a[0]);
    for (const [d2, dx, dy] of ring) {
      const x = cx + dx;
      const y = cy + dy;
      const i = y * this.width + x;
      const def = MATERIALS[this.mat[i]];
      if (def.explosive) {
        if (this.burn[i] === 0) this.burn[i] = this.rng.int(2, 6);
        continue;
      }
      if (def.flammability > 0 && this.rng.chance(0.5)) this.ignite(i);
      if (def.kind === 'powder' || def.kind === 'liquid') {
        const dist = Math.sqrt(d2);
        this.throwParticle(i, x, y, dx / dist, dy / dist, 2 + this.rng.int(0, Math.ceil((outer - dist) * 2) + 4));
      }
    }
    return true;
  }

  /** Move particle i along direction (ux, uy) to the furthest empty cell within `maxDist`. */
  private throwParticle(i: number, x: number, y: number, ux: number, uy: number, maxDist: number): void {
    let target = -1;
    for (let s = 1; s <= maxDist; s++) {
      const nx = Math.round(x + ux * s);
      const ny = Math.round(y + uy * s);
      if (!this.inBounds(nx, ny)) break;
      const n = ny * this.width + nx;
      if (n === i) continue;
      if (this.mat[n] !== M.Empty) break;
      target = n;
    }
    if (target >= 0) {
      this.swap(i, target);
      this.vel[target] = 0;
    }
  }

  // ---------------------------------------------------------------- update loop

  /** Advance the simulation by one frame. */
  step(): void {
    this.frame++;
    this.explosionsThisFrame = 0;
    const { width: w, height: h, mat, stamp } = this;
    const f = this.frame;
    const leftToRight = (f & 1) === 0;
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let k = 0; k < w; k++) {
        const x = leftToRight ? k : w - 1 - k;
        const i = row + x;
        const m = mat[i];
        if (m === M.Empty || stamp[i] === f) continue;
        this.updateCell(x, y, i, MATERIALS[m]);
      }
    }
  }

  private updateCell(x: number, y: number, i: number, def: MaterialDef): void {
    if (this.burn[i] > 0 && this.updateBurning(x, y, i, def)) return;

    if (def.lifetime && --this.life[i] <= 0) {
      const decay = def.decay;
      this.setCell(i, decay && this.rng.chance(decay.chance) ? decay.into : M.Empty);
      return;
    }

    if (def.update && def.update(this, x, y, i)) return;

    switch (def.kind) {
      case 'powder':
        this.movePowder(x, y, i, def);
        break;
      case 'liquid':
        this.moveLiquid(x, y, i, def);
        break;
      case 'gas':
        this.moveGas(x, y, i, def);
        break;
      default:
        break;
    }
  }

  /** One frame of a burning cell. Returns true if the cell burned out (or exploded). */
  private updateBurning(x: number, y: number, i: number, def: MaterialDef): boolean {
    for (const [dx, dy] of N4) {
      if (this.get(x + dx, y + dy) !== M.Water) continue;
      const n = this.idx(x + dx, y + dy);
      if (this.rng.chance(def.extinguishChance)) {
        this.burn[i] = 0;
        if (this.rng.chance(0.5)) this.setCell(n, M.Steam);
        return false;
      }
      // Too hot to put out: the water slowly boils instead.
      if (this.rng.chance(0.04)) this.setCell(n, M.Steam);
      break;
    }

    if (--this.burn[i] <= 0) {
      if (def.explosive) {
        this.detonate(x, y, i, def);
      } else {
        this.setCell(i, def.burnsInto);
      }
      return true;
    }

    this.igniteNeighbours(x, y);

    // Flames and a little smoke above the burning cell.
    if (this.rng.chance(0.25)) {
      const fx = x + this.rng.int(-1, 1);
      if (this.get(fx, y - 1) === M.Empty) this.set(fx, y - 1, M.Fire);
    } else if (this.rng.chance(0.02) && this.get(x, y - 1) === M.Empty) {
      this.set(x, y - 1, M.Smoke);
    }
    return false;
  }

  private detonate(x: number, y: number, i: number, def: MaterialDef): void {
    if (!def.explosive) return;
    // Over this frame's budget: keep the fuse lit and try again next frame.
    if (!this.explode(x, y, def.explosive.radius)) this.burn[i] = 1;
  }

  /**
   * Fall straight down, accelerating, through empty cells or lighter fluids.
   * Returns true if the particle moved.
   */
  private fall(x: number, y: number, i: number, def: MaterialDef): boolean {
    const w = this.width;
    const steps = Math.min(1 + (this.vel[i] >> 2), MAX_FALL_STEPS);
    let ci = i;
    let cy = y;
    for (let s = 0; s < steps && cy + 1 < this.height; s++) {
      const ni = ci + w;
      const t = this.mat[ni];
      if (t === M.Empty) {
        this.swap(ci, ni);
        ci = ni;
        cy++;
        continue;
      }
      if (FLUID[t] && DENSITY[t] < def.density) {
        // Sinking through a liquid: one cell, and it slows the fall.
        this.swap(ci, ni);
        ci = ni;
        if (this.vel[ci] > 3) this.vel[ci] = 3;
      }
      break;
    }

    if (ci !== i) {
      if (this.vel[ci] < 255) this.vel[ci]++;
      return true;
    }

    // Landed. A hard landing on something solid sets off explosives.
    if (def.explosive && this.vel[i] >= def.explosive.impactSpeed && this.isSolid(x, y + 1)) {
      this.vel[i] = 0;
      this.detonate(x, y, i, def);
      return true;
    }
    this.vel[i] = 0;
    return false;
  }

  /** Move to (nx, ny) if it is empty or a fluid lighter than def (moving down or sideways). */
  private tryDisplace(i: number, nx: number, ny: number, def: MaterialDef): boolean {
    if (!this.inBounds(nx, ny)) return false;
    const n = ny * this.width + nx;
    const t = this.mat[n];
    if (t !== M.Empty && !(FLUID[t] && DENSITY[t] < def.density)) return false;
    this.swap(i, n);
    return true;
  }

  /** Move to (nx, ny) if it is empty or a fluid heavier than def (gases moving up). */
  private tryRise(i: number, nx: number, ny: number, def: MaterialDef): boolean {
    if (!this.inBounds(nx, ny)) return false;
    const n = ny * this.width + nx;
    const t = this.mat[n];
    if (t !== M.Empty && !(FLUID[t] && DENSITY[t] > def.density)) return false;
    this.swap(i, n);
    return true;
  }

  private movePowder(x: number, y: number, i: number, def: MaterialDef): void {
    if (this.fall(x, y, i, def)) return;
    const dir = this.rng.sign();
    if (this.tryDisplace(i, x + dir, y + 1, def)) return;
    this.tryDisplace(i, x - dir, y + 1, def);
  }

  private moveLiquid(x: number, y: number, i: number, def: MaterialDef): void {
    if (this.fall(x, y, i, def)) return;
    if (def.viscosity > 0 && this.rng.chance(def.viscosity)) return;
    const dir = this.rng.sign();
    if (this.tryDisplace(i, x + dir, y + 1, def)) return;
    if (this.tryDisplace(i, x - dir, y + 1, def)) return;
    if (this.flow(x, y, i, def, dir)) return;
    this.flow(x, y, i, def, -dir);
  }

  /**
   * Spread sideways up to `dispersion` cells. Stops early above a gap (so liquid pours over edges
   * rather than skipping across them) or when it meets a lighter liquid, which it swaps with.
   */
  private flow(x: number, y: number, i: number, def: MaterialDef, dir: number): boolean {
    let target = -1;
    for (let s = 1; s <= def.dispersion; s++) {
      const nx = x + dir * s;
      if (nx < 0 || nx >= this.width) break;
      const n = i + dir * s;
      const t = this.mat[n];
      if (t === M.Empty) {
        target = n;
        const below = this.get(nx, y + 1);
        if (below === M.Empty || (FLUID[below] && DENSITY[below] < def.density)) break;
        continue;
      }
      if (FLUID[t] && DENSITY[t] < def.density) target = n;
      break;
    }
    if (target < 0) return false;
    this.swap(i, target);
    return true;
  }

  private moveGas(x: number, y: number, i: number, def: MaterialDef): void {
    // `rise` is how often it heads straight up; otherwise it climbs diagonally or just drifts.
    const r = this.rng.next();
    if (r < def.rise && this.tryRise(i, x, y - 1, def)) return;
    const dir = this.rng.sign();
    if (r < def.rise + (1 - def.rise) * 0.6) {
      if (this.tryRise(i, x + dir, y - 1, def)) return;
      if (this.tryRise(i, x - dir, y - 1, def)) return;
    }
    // Drift sideways into open air.
    const nx = x + dir;
    if (this.get(nx, y) === M.Empty) this.swap(i, this.idx(nx, y));
  }
}
