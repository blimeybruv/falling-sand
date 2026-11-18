/**
 * The simulation grid and its update loop. Pure logic: no DOM, no rendering, no input.
 *
 * Each cell is an index i = y * width + x into parallel typed arrays:
 *   mat   material id (see ids.ts)
 *   shade colour variation, 0..SHADES-1, picked when the particle is created and carried with it
 *   life  remaining lifetime in frames, for short-lived materials (fire, smoke, steam)
 *   burn  > 0 while the cell is burning: frames left before it burns out (or, for explosives, the fuse)
 *   vel   consecutive frames spent falling; drives acceleration and nitroglycerin's impact trigger
 *   temp  temperature (AMBIENT_TEMP is room temperature); spreads between neighbours every frame
 *   vx,vy velocity of a particle in flight (thrown by an explosion), in 1/SUB cells per frame
 *
 * The grid is updated bottom-up, alternating left-to-right and right-to-left each frame, and every
 * cell moves at most once per frame (tracked with `stamp`).
 */
import { M, type MaterialId } from './ids';
import {
  AMBIENT_TEMP,
  BURNING_TEMP,
  MATERIALS,
  MAX_BLAST_RADIUS,
  MAX_EXPLOSIONS_PER_FRAME,
  type MaterialDef,
} from './materials';
import { Rng } from './rng';

/** Number of colour variations per material. */
export const SHADES = 16;
/** A falling particle moves at most this many cells per frame. */
const MAX_FALL_STEPS = 4;

/** density[id] and fluid[id] (empty, liquid or gas: can be displaced by a heavier mover). */
const DENSITY = Float32Array.from(MATERIALS, (d) => d.density);
const FLUID = Uint8Array.from(MATERIALS, (d) => (d.kind === 'empty' || d.kind === 'liquid' || d.kind === 'gas' ? 1 : 0));
const FLAMMABLE = Uint8Array.from(MATERIALS, (d) => (d.flammability > 0 ? 1 : 0));
const CONDUCTIVITY = Float32Array.from(MATERIALS, (d) => d.conductivity);
/** The temperature each material drifts towards, and how fast (its heat source, or ambient cooling). */
const HOLD_TEMP = Float32Array.from(MATERIALS, (d) => (d.heat ? d.heat.temp : AMBIENT_TEMP));
const HOLD_RATE = Float32Array.from(MATERIALS, (d) => (d.heat ? d.heat.rate : d.cooling));
const WIND = Float32Array.from(MATERIALS, (d) => d.wind);

// Module-local copies of imported constants used in hot loops. (Under Vitest's module transform,
// every read of an imported binding is a property lookup, which made benchmarks misleading.)
const EMPTY: number = M.Empty;
const AMBIENT = AMBIENT_TEMP;
const BURNING = BURNING_TEMP;
const MATS = MATERIALS;

/** Flight velocities are stored in 1/SUB cells per frame, so they fit an Int8Array. */
export const SUB = 8;
/** Downward acceleration of particles in flight, in 1/SUB cells per frame per frame. */
const GRAVITY = 2;

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
  readonly vx: Int8Array;
  readonly vy: Int8Array;
  /** Current temperatures. Double-buffered, so this array is replaced every frame: don't hold on to it. */
  temp: Float32Array;
  private tempBack: Float32Array;
  readonly rng: Rng;
  /** Frames simulated so far. */
  frame = 0;
  /** Sideways wind, -1 (full left) to 1 (full right). Pushes gases and falling particles. */
  wind = 0;
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
    this.vx = new Int8Array(this.size);
    this.vy = new Int8Array(this.size);
    this.temp = new Float32Array(this.size).fill(AMBIENT_TEMP);
    this.tempBack = new Float32Array(this.size).fill(AMBIENT_TEMP);
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

  /** Material definition at (x, y); outside the grid counts as Stone. */
  defAt(x: number, y: number): MaterialDef {
    return MATS[this.get(x, y)];
  }

  /** True for walls, static materials and powders (things fluids can't pass through). */
  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    const kind = MATS[this.mat[y * this.width + x]].kind;
    return kind === 'static' || kind === 'powder';
  }

  /** Place a fresh particle at (x, y). Ignored outside the grid. */
  set(x: number, y: number, m: MaterialId): void {
    if (this.inBounds(x, y)) this.setCell(y * this.width + x, m);
  }

  /**
   * Replace cell i with a fresh particle of material m (new colour shade and lifetime, not burning,
   * not moving, at room temperature or its own heat source's temperature).
   * The new particle does not act until the next frame.
   */
  setCell(i: number, m: MaterialId): void {
    const def = MATS[m];
    this.mat[i] = m;
    this.shade[i] = (this.rng.next() * SHADES) | 0;
    this.life[i] = def.lifetime ? this.rng.int(def.lifetime[0], def.lifetime[1]) : 0;
    this.burn[i] = 0;
    this.vel[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.temp[i] = def.heat ? def.heat.temp : AMBIENT_TEMP;
    this.stamp[i] = this.frame;
  }

  /** Like setCell, but keeps the cell's temperature (for melting, boiling, cooling to stone...). */
  transform(i: number, m: MaterialId): void {
    const t = this.temp[i];
    this.setCell(i, m);
    this.temp[i] = t;
  }

  /** Throw particle i with a velocity in cells per frame (positive y is down). */
  launch(i: number, vxCells: number, vyCells: number): void {
    this.vx[i] = Math.max(-127, Math.min(127, Math.round(vxCells * SUB)));
    this.vy[i] = Math.max(-127, Math.min(127, Math.round(vyCells * SUB)));
  }

  /** Swap two cells (all their state) and mark both as moved this frame. */
  swap(a: number, b: number): void {
    const { mat, shade, life, burn, vel, vx, vy, temp } = this;
    let t: number;
    t = mat[a]; mat[a] = mat[b]; mat[b] = t;
    t = shade[a]; shade[a] = shade[b]; shade[b] = t;
    t = life[a]; life[a] = life[b]; life[b] = t;
    t = burn[a]; burn[a] = burn[b]; burn[b] = t;
    t = vel[a]; vel[a] = vel[b]; vel[b] = t;
    t = vx[a]; vx[a] = vx[b]; vx[b] = t;
    t = vy[a]; vy[a] = vy[b]; vy[b] = t;
    t = temp[a]; temp[a] = temp[b]; temp[b] = t;
    this.stamp[a] = this.frame;
    this.stamp[b] = this.frame;
  }

  clear(): void {
    this.mat.fill(M.Empty);
    this.shade.fill(0);
    this.life.fill(0);
    this.burn.fill(0);
    this.vel.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this.temp.fill(AMBIENT_TEMP);
    this.tempBack.fill(AMBIENT_TEMP);
    this.stamp.fill(0);
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
    const kind = MATS[m].kind;
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

  /**
   * Set cell i alight if it is flammable and not already burning. Returns true if it caught.
   * The cell doesn't act again until next frame.
   */
  ignite(i: number): boolean {
    const def = MATS[this.mat[i]];
    if (def.flammability <= 0 || this.burn[i] > 0) return false;
    // Materials with no burn time (nitroglycerin) get a short fuse instead.
    this.burn[i] = def.burnTime[1] > 0 ? this.rng.int(def.burnTime[0], def.burnTime[1]) : this.rng.int(1, 4);
    // Like a new particle, a cell that has just caught fire waits until next frame to act,
    // so fire spreads the same way whichever direction the scan runs.
    this.stamp[i] = this.frame;
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
      if (FLAMMABLE[t] && this.burn[n] === 0 && this.rng.chance(MATS[t].flammability)) this.ignite(n);
    }
  }

  // ---------------------------------------------------------------- explosions

  /**
   * Blast at (cx, cy). Everything destructible within `radius` (capped at MAX_BLAST_RADIUS) is
   * cleared, some of it to fire. In a ring beyond that, loose particles are thrown outwards (they fly
   * on later frames), flammable ones may catch, and other explosives get a short fuse, so chains
   * spread over several frames instead of recursing. Returns false, doing nothing, if this frame's
   * explosion budget (MAX_EXPLOSIONS_PER_FRAME, reset by step()) is spent; try again next frame.
   */
  explode(cx: number, cy: number, radius: number): boolean {
    if (this.explosionsThisFrame >= MAX_EXPLOSIONS_PER_FRAME) return false;
    this.explosionsThisFrame++;

    const r = Math.max(1, Math.min(Math.round(radius), MAX_BLAST_RADIUS));
    const outer = r + Math.ceil(r * 0.75);
    const r2 = r * r;
    const o2 = outer * outer;

    for (let dy = -outer; dy <= outer; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.height) continue;
      for (let dx = -outer; dx <= outer; dx++) {
        const x = cx + dx;
        const d2 = dx * dx + dy * dy;
        if (x < 0 || x >= this.width || d2 > o2) continue;
        const i = y * this.width + x;
        const def = MATS[this.mat[i]];
        if (d2 <= r2) {
          if (!def.indestructible) this.setCell(i, this.rng.chance(0.25) ? M.Fire : M.Empty);
          continue;
        }
        if (def.kind === 'empty') continue;
        if (def.explosive) {
          if (this.burn[i] === 0) {
            this.burn[i] = this.rng.int(2, 6);
            this.stamp[i] = this.frame;
          }
          continue;
        }
        if (def.flammability > 0 && this.rng.chance(0.5)) this.ignite(i);
        if (def.kind === 'powder' || def.kind === 'liquid') {
          // Faster nearer the blast, with a kick upwards.
          const dist = Math.sqrt(d2);
          const speed = 1.5 + (outer - dist) * 0.6 + this.rng.next() * 1.5;
          this.launch(i, (dx / dist) * speed, (dy / dist) * speed - 1.5);
        }
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- update loop

  /** Advance the simulation by one frame. */
  step(): void {
    this.frame++;
    this.explosionsThisFrame = 0;
    this.updateTemperature();
    const { width: w, height: h, mat, stamp } = this;
    const f = this.frame;
    const leftToRight = (f & 1) === 0;
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let k = 0; k < w; k++) {
        const x = leftToRight ? k : w - 1 - k;
        const i = row + x;
        const m = mat[i];
        if (m === EMPTY || stamp[i] === f) continue;
        this.updateCell(x, y, i, MATS[m]);
      }
    }
  }

  /**
   * Spread heat: each cell moves towards the average of its four neighbours (by its conductivity),
   * then towards its own heat source's temperature, or back towards ambient. Burning cells are hot.
   * Grid edges reuse the cell's own temperature for the missing neighbour.
   */
  private updateTemperature(): void {
    const { width: w, height: h, mat, burn } = this;
    const t = this.temp;
    const out = this.tempBack;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const upOff = y > 0 ? -w : 0;
      const downOff = y < h - 1 ? w : 0;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const c = t[i];
        const sum = t[i + upOff] + t[i + downOff] + t[x > 0 ? i - 1 : i] + t[x < w - 1 ? i + 1 : i];
        const m = mat[i];
        const hold = HOLD_TEMP[m];
        // Fast path: idle cells at room temperature, among neighbours at room temperature.
        if (c === AMBIENT && sum === 4 * AMBIENT && hold === AMBIENT && burn[i] === 0) {
          out[i] = AMBIENT;
          continue;
        }
        let v = c + (sum * 0.25 - c) * CONDUCTIVITY[m];
        if (burn[i] > 0) {
          v += (BURNING - v) * 0.3;
        } else {
          v += (hold - v) * HOLD_RATE[m];
          // Snap when close, so cooling settles exactly and the fast path can take over.
          if (v - hold < 0.05 && hold - v < 0.05) v = hold;
        }
        out[i] = v;
      }
    }
    this.tempBack = t;
    this.temp = out;
  }

  private updateCell(x: number, y: number, i: number, def: MaterialDef): void {
    if (this.burn[i] > 0 && this.updateBurning(x, y, i, def)) return;

    // Temperature-driven changes: melting and boiling, and catching fire from heat alone.
    const t = this.temp[i];
    if (def.above && t > def.above.temp) {
      this.transform(i, def.above.into);
      return;
    }
    if (def.ignitesAt !== undefined && this.burn[i] === 0 && t >= def.ignitesAt && this.ignite(i)) return;

    if (def.lifetime && --this.life[i] <= 0) {
      const decay = def.decay;
      this.setCell(i, decay && this.rng.chance(decay.chance) ? decay.into : M.Empty);
      return;
    }

    if (def.update && def.update(this, x, y, i)) return;

    if ((this.vx[i] | this.vy[i]) !== 0 && (def.kind === 'powder' || def.kind === 'liquid') && this.fly(x, y, i)) {
      return;
    }

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
      const ex = def.explosive;
      if (ex && (ex.chance === undefined || this.rng.chance(ex.chance))) {
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
      // Wind blows falling particles sideways.
      const wind = this.wind * WIND[def.id];
      if (wind !== 0 && this.rng.chance(Math.abs(wind))) this.tryDisplace(ci, x + Math.sign(wind), cy, def);
      return true;
    }

    // Landed. A hard landing on something solid sets off impact-sensitive explosives.
    const impact = def.explosive?.impactSpeed;
    if (impact !== undefined && this.vel[i] >= impact && this.isSolid(x, y + 1)) {
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

  /**
   * Move a particle in flight along its velocity, under gravity. It stops when it hits something,
   * unless that is another particle still in flight, in which case it waits and tries again.
   * Returns true if the particle used its move (moved, or is waiting).
   */
  private fly(x: number, y: number, i: number): boolean {
    const vx = this.vx[i];
    const vy = Math.min(127, this.vy[i] + GRAVITY);
    const mx = this.stochasticRound(vx / SUB);
    const my = this.stochasticRound(vy / SUB);
    const steps = Math.max(Math.abs(mx), Math.abs(my));
    let ci = i;
    let blocked = false;
    let waiting = false;
    for (let s = 1; s <= steps; s++) {
      const nx = x + Math.round((mx * s) / steps);
      const ny = y + Math.round((my * s) / steps);
      if (!this.inBounds(nx, ny)) {
        blocked = true;
        break;
      }
      const n = ny * this.width + nx;
      if (n === ci) continue;
      const t = this.mat[n];
      if (t === M.Empty || MATS[t].kind === 'gas') {
        this.swap(ci, n);
        ci = n;
        continue;
      }
      blocked = true;
      waiting = (this.vx[n] | this.vy[n]) !== 0;
      break;
    }
    if (blocked && !waiting) {
      this.vx[ci] = 0;
      this.vy[ci] = 0;
      this.vel[ci] = 0;
      return ci !== i;
    }
    this.vx[ci] = vx;
    this.vy[ci] = vy;
    this.stamp[ci] = this.frame;
    return true;
  }

  /** Round to an integer, up or down at random in proportion, so slow speeds still average out. */
  private stochasticRound(v: number): number {
    const f = Math.floor(v);
    return f + (this.rng.next() < v - f ? 1 : 0);
  }

  private moveGas(x: number, y: number, i: number, def: MaterialDef): void {
    // Wind first: gases are pushed sideways (and up) in its direction.
    const wind = this.wind * WIND[def.id];
    if (wind !== 0 && this.rng.chance(Math.abs(wind))) {
      const d = Math.sign(wind);
      if (this.tryRise(i, x + d, y - 1, def)) return;
      if (this.get(x + d, y) === M.Empty) {
        this.swap(i, this.idx(x + d, y));
        return;
      }
    }
    // `rise` is how often it heads straight up; otherwise it climbs diagonally or just drifts.
    const r = this.rng.next();
    if (r < def.rise && this.tryRise(i, x, y - 1, def)) return;
    const dir = this.rng.sign();
    if (r < def.rise + (1 - def.rise) * 0.6) {
      if (this.tryRise(i, x + dir, y - 1, def)) return;
      if (this.tryRise(i, x - dir, y - 1, def)) return;
    }
    // Drift sideways into open air, trying the other side if the first is blocked.
    if (this.get(x + dir, y) === M.Empty) this.swap(i, this.idx(x + dir, y));
    else if (this.get(x - dir, y) === M.Empty) this.swap(i, this.idx(x - dir, y));
  }
}
