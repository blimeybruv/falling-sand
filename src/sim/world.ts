/**
 * The simulation grid and its update loop. Pure logic: no DOM, no rendering, no input.
 *
 * Each cell is an index i = y * width + x into parallel typed arrays:
 *   mat   material id (see ids.ts)
 *   shade colour variation, 0..SHADES-1, picked when the particle is created and carried with it
 *   life  remaining lifetime in frames, for short-lived materials (fire, smoke, steam)
 *   burn  > 0 while the cell is burning: frames left before it burns out (or, for explosives, the fuse)
 *   vel   consecutive frames spent falling; drives acceleration and nitroglycerin's impact trigger
 *         (clouds never fall: in a cloud cell it counts down to a lightning strike)
 *   temp  temperature (AMBIENT_TEMP is room temperature); spreads between neighbours every frame
 *   vx,vy velocity of a particle in flight (thrown by an explosion), in 1/SUB cells per frame
 *   charge electricity in a conductor: CHARGE_ACTIVE for one frame, then counting down (cooldown)
 *
 * The grid is updated bottom-up, alternating left-to-right and right-to-left each frame, and every
 * cell moves at most once per frame (tracked with `stamp`).
 */
import { M, type MaterialId } from './ids';
import {
  AMBIENT_TEMP,
  BURNING_TEMP,
  NIGHT_CHILL,
  NIGHT_HEAT,
  SUN_HEAT,
  SUN_WARMTH,
  MATERIALS,
  MAX_BLAST_RADIUS,
  MAX_EXPLOSIONS_PER_FRAME,
  MAX_VENT_CELLS_PER_FRAME,
  type MaterialDef,
  type Reaction,
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
const EXTINGUISHES = Uint8Array.from(MATERIALS, (d) => (d.extinguishes ? 1 : 0));
const CONDUCTS = Uint8Array.from(MATERIALS, (d) => (d.conducts ? 1 : 0));
/**
 * Materials that never do anything by themselves (static, no behaviour, reactions, phase changes,
 * lifetime or flammability), like stone. step() skips their cells entirely unless they're burning.
 * Electricity and temperature are handled in their own passes, so those still reach them.
 */
const INERT = Uint8Array.from(MATERIALS, (d) =>
  d.kind === 'static' &&
  !d.update &&
  !d.reactions &&
  !d.above &&
  !d.below &&
  d.ignitesAt === undefined &&
  !d.lifetime &&
  d.flammability === 0 &&
  !d.explosive
    ? 1
    : 0,
);

/**
 * Electricity. A conductor cell's charge is CHARGE_ACTIVE for one frame (when it passes the charge
 * on to idle conducting neighbours), then counts down through a cooldown to 0, so a pulse travels
 * along a wire one cell per frame and can't flow back the way it came.
 */
export const CHARGE_ACTIVE = 4;
/** Marks a cell that will become active at the end of this frame's electricity pass. */
const CHARGE_PENDING = 255;
/**
 * How much an active conductor warms up per pulse: a wire a lot, a conducting liquid (salt water,
 * mercury) hardly at all, as it carries the heat away. At the wire's rate, the few pulses of one
 * lightning strike into the sea boiled the whole sea away into salt.
 */
const CHARGE_HEAT = Float32Array.from(MATERIALS, (d) => (d.kind === 'liquid' ? 1 : 20));
/**
 * After carrying a pulse, a conducting liquid rests this long before it can carry another (a wire
 * only CHARGE_ACTIVE - 1 frames). Its charge counts down from CHARGE_ACTIVE + LIQUID_REST and skips
 * straight to 0 below CHARGE_ACTIVE + 1, so it never passes through "active" again. Without the long
 * rest a pulse could run round and round any obstacle in a body of salt water (a grain of salt, a
 * strand of seaweed), so a sea struck once by lightning kept pulsing for ever. A wire, a cell
 * wide, can't loop like that.
 */
const LIQUID_REST = 90;
const RESTS = Uint8Array.from(MATERIALS, (d) => (d.kind === 'liquid' && d.conducts ? 1 : 0));
const CONDUCTIVITY = Float32Array.from(MATERIALS, (d) => d.conductivity);
/** The temperature each material drifts towards, and how fast (its heat source, or ambient cooling). */
const HOLD_TEMP = Float32Array.from(MATERIALS, (d) => (d.heat ? d.heat.temp : AMBIENT_TEMP));
const HOLD_RATE = Float32Array.from(MATERIALS, (d) => (d.heat ? d.heat.rate : d.cooling));
const BURN_TEMP = Float32Array.from(MATERIALS, (d) => d.burnTemp ?? BURNING_TEMP);
const WIND = Float32Array.from(MATERIALS, (d) => d.wind);
const DRIFTS = Float32Array.from(MATERIALS, (d) => d.drifts ?? 0);
const LOFTS = Float32Array.from(MATERIALS, (d) => d.lofts ?? 0);
/**
 * Stasis pockets: at most MAX_STASIS take effect at once, each slowing the cells within STASIS_REACH
 * to one update in STASIS_SLOW frames (staggered, so the pocket moves in slow motion, not in jerks).
 */
const MAX_STASIS = 32;
/** At most this many linked gates are linked at once. */
const MAX_GATES = 64;
const STASIS_REACH = 7;
const STASIS_SLOW = 8;
const STASIS: number = M.StasisPocket;
/** How many cells of the same liquid below make it deep (see `deepBelow`). */
const DEEP_LIQUID = 4;
/** Powders that the "fixed" drawing option can pin in place: not creatures, seeds and other life, which move by themselves. */
const PINNABLE = Uint8Array.from(MATERIALS, (d) => (d.kind === 'powder' && d.category !== 'life' ? 1 : 0));
/** For sound: glass that shatters audibly in a blast, and ice that cracks as it melts. */
const GLASSY = Uint8Array.from(MATERIALS, (d) => (d.id === M.Glass || d.id === M.StainedGlass || d.id === M.Icicle ? 1 : 0));
const ICY = Uint8Array.from(MATERIALS, (d) => (d.id === M.Ice || d.id === M.ThinIce || d.id === M.Icicle ? 1 : 0));
/** Sunlight shines through these (air, gases, glass) and stops at the first thing that isn't. */
const TRANSPARENT = Uint8Array.from(MATERIALS, (d) => ((d.transparent ?? (d.kind === 'gas' || d.kind === 'empty')) ? 1 : 0));
const SUNLIT_CHANCE = Float32Array.from(MATERIALS, (d) => d.sunlit?.chance ?? 0);
const NIGHT_CHANCE = Float32Array.from(MATERIALS, (d) => d.night?.chance ?? 0);
/** Each material's kind as a small number, for the open-edges pass. */
const KIND_EMPTY = 0;
const KIND_STATIC = 1;
const KIND_POWDER = 2;
const KIND_LIQUID = 3;
const KIND_GAS = 4;
const KIND = Uint8Array.from(MATERIALS, (d) =>
  d.kind === 'static' ? KIND_STATIC : d.kind === 'powder' ? KIND_POWDER : d.kind === 'liquid' ? KIND_LIQUID : d.kind === 'gas' ? KIND_GAS : KIND_EMPTY,
);
/** Clouds that move as a body: they leave by open edges only with the wind. */
const IS_CLOUD = Uint8Array.from(MATERIALS, (d) => (d.id === M.Cloud || d.id === M.StormCloud ? 1 : 0));
/** Under the night sky, cells colder than this take their `night.cold` change (-Infinity: none). */
const NIGHT_COLD_TEMP = Float32Array.from(MATERIALS, (d) => d.night?.cold?.temp ?? -Infinity);

// Module-local copies of imported constants used in hot loops. (Under Vitest's module transform,
// every read of an imported binding is a property lookup, which made benchmarks misleading.)
const EMPTY: number = M.Empty;
const AMBIENT = AMBIENT_TEMP;
const MATS = MATERIALS;

/** Frames a fish stays stunned after a blast (counted down in its `vel`). */
const FISH_STUN = 150;

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
/** The eight neighbours as flat offset arrays, for hot loops. */
const DX8 = Int8Array.of(-1, 0, 1, -1, 1, -1, 0, 1);
const DY8 = Int8Array.of(-1, -1, -1, 0, 0, 1, 1, 1);

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
  readonly charge: Uint8Array;
  /**
   * 1 for a powder drawn with "fixed" on (`drawFixed`): it stays where it was put instead of
   * falling or sliding (it still burns, melts and reacts). Anything that becomes something else
   * loses it.
   */
  readonly pinned: Uint8Array;
  /** While set, powders drawn with the brush or the shape tools are pinned (see `pinned`). */
  drawFixed = false;

  /** Stasis pockets that registered last frame (their x, y), which slow the cells around them this frame. */
  private readonly stasisX = new Int32Array(MAX_STASIS);
  private readonly stasisY = new Int32Array(MAX_STASIS);
  private stasisCount = 0;
  /** ...and those registering this frame, for the next. */
  private readonly stasisNextX = new Int32Array(MAX_STASIS);
  private readonly stasisNextY = new Int32Array(MAX_STASIS);
  private stasisNextCount = 0;

  /** A stasis pocket at (x, y) slows time around it next frame (called from its behaviour). */
  holdStasis(x: number, y: number): void {
    if (this.stasisNextCount >= MAX_STASIS) return;
    this.stasisNextX[this.stasisNextCount] = x;
    this.stasisNextY[this.stasisNextCount++] = y;
  }

  /** Linked gates that registered last frame (cell indices), and those registering this frame. */
  private readonly gates = new Int32Array(MAX_GATES);
  private gatesFound = 0;
  private readonly gatesNext = new Int32Array(MAX_GATES);
  private gatesNextCount = 0;

  /** A linked gate at cell i is open next frame (called from its behaviour). */
  holdGate(i: number): void {
    if (this.gatesNextCount < MAX_GATES) this.gatesNext[this.gatesNextCount++] = i;
  }

  /** How many linked gates were open last frame. */
  get gateCount(): number {
    return this.gatesFound;
  }

  /** The cell index of open gate k (0 to gateCount - 1). It may since have been erased: check the cell. */
  gateAt(k: number): number {
    return this.gates[k];
  }

  /** Whether (x, y) lies within reach of a stasis pocket this frame. */
  private inStasis(x: number, y: number): boolean {
    for (let k = 0; k < this.stasisCount; k++) {
      const dx = x - this.stasisX[k];
      const dy = y - this.stasisY[k];
      if (dx * dx + dy * dy <= STASIS_REACH * STASIS_REACH) return true;
    }
    return false;
  }

  /** Whether a cell of material m can be pinned: a powder that isn't alive (worms and seeds move by themselves). */
  canPin(m: MaterialId): boolean {
    return PINNABLE[m] === 1;
  }
  /** Current temperatures. Double-buffered, so this array is replaced every frame: don't hold on to it. */
  temp: Float32Array;
  private tempBack: Float32Array;
  readonly rng: Rng;
  /** Frames simulated so far. */
  frame = 0;
  /** Sideways wind, -1 (full left) to 1 (full right). Pushes gases and falling particles. */
  wind = 0;
  /**
   * Audible events since the UI last looked (it reads and zeroes these; the simulation itself makes
   * no sound): explosions and the biggest radius among them, lightning strikes, frames of charge
   * building before a strike (corona), acid eating something, fireworks bursting, popcorn popping,
   * glass shattering in a blast, ice cracking (melting, or a pond skinning over).
   */
  readonly noise = { blasts: 0, blastRadius: 0, strikes: 0, corona: 0, fizzes: 0, bursts: 0, pops: 0, shatters: 0, cracks: 0 };
  /**
   * Sunshine, 0 (none) to 1 (full). Light comes straight down each column and warms the first thing
   * it reaches, which may also change (`sunlit` in the material table): water evaporates, clouds burn off.
   * Below 0 it's a clear night, down to -1: the first thing under the open sky in each column loses
   * heat to it, towards NIGHT_CHILL below ambient, and may change (`night`). Whatever is under a
   * cloud or a roof stays warm.
   */
  sun = 0;
  /**
   * Frames in a whole day and night (0: no cycle, `sun` stays as set). While cycling, `sun` follows
   * the time of day, starting at sunrise when `dayClock` is 0.
   */
  dayLength = 0;
  /** Frames since sunrise of the first day; step() advances it while `dayLength` is set. */
  dayClock = 0;
  /** Gusty wind: while set, step() varies `wind` smoothly, in strength and now and then in direction. */
  gusty = false;
  /**
   * Open edges: instead of walls, the grid's edges let things leave. Sand, liquids and creatures
   * fall out of the bottom, liquids and gases flow out of the sides, gases rise out of the top,
   * clouds sail off a side the wind is blowing towards, and anything flying off the grid is gone.
   * Solid things (stone, wood, walls you draw) stay put, so you can build a floor. (`get` still
   * reports Stone outside the grid either way: things reaching an open edge drain away instead.)
   */
  openEdges = false;
  /** Frame number in which each cell last moved or was created; such cells are skipped. */
  private readonly stamp: Uint32Array;
  private explosionsThisFrame = 0;
  /** How many more cells vents may release this frame (refilled by step(); see MAX_VENT_CELLS_PER_FRAME). */
  ventBudget = 0;
  /**
   * How many cells of each material the simulation itself has created (in step(), not by the brush
   * or by loading a scene). Discovery mode watches this to unlock materials.
   */
  readonly created: Uint32Array = new Uint32Array(MATERIALS.length);
  private stepping = false;

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
    this.charge = new Uint8Array(this.size);
    this.pinned = new Uint8Array(this.size);
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

  /** True if any cell within `r` (a square) of (x, y) holds material m. */
  near(x: number, y: number, r: number, m: MaterialId): boolean {
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < this.width && this.mat[ny * this.width + nx] === m) return true;
      }
    }
    return false;
  }

  /** True if any of the 4 neighbours of (x, y) is open air. */
  touchesAir(x: number, y: number): boolean {
    return (
      this.get(x - 1, y) === M.Empty ||
      this.get(x + 1, y) === M.Empty ||
      this.get(x, y - 1) === M.Empty ||
      this.get(x, y + 1) === M.Empty
    );
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
    this.charge[i] = 0;
    this.pinned[i] = 0;
    this.temp[i] = def.heat ? def.heat.temp : (def.startTemp ?? AMBIENT_TEMP);
    this.stamp[i] = this.frame;
    if (this.stepping) this.created[m]++;
  }

  /**
   * Like setCell, but keeps the cell's temperature (for melting, boiling, cooling to stone...),
   * unless the new material has a `startTemp`.
   */
  transform(i: number, m: MaterialId): void {
    const t = this.temp[i];
    this.setCell(i, m);
    // A material with its own starting temperature (frost, molten metal) takes that instead.
    if (MATS[m].startTemp === undefined) this.temp[i] = t;
  }

  /** Throw particle i with a velocity in cells per frame (positive y is down). */
  launch(i: number, vxCells: number, vyCells: number): void {
    // Thrown, a fixed grain comes loose.
    this.pinned[i] = 0;
    this.vx[i] = Math.max(-127, Math.min(127, Math.round(vxCells * SUB)));
    this.vy[i] = Math.max(-127, Math.min(127, Math.round(vyCells * SUB)));
  }

  /** Swap two cells (all their state) and mark both as moved this frame. */
  swap(a: number, b: number): void {
    const { mat, shade, life, burn, vel, vx, vy, temp, charge, pinned } = this;
    let t: number;
    t = mat[a]; mat[a] = mat[b]; mat[b] = t;
    t = shade[a]; shade[a] = shade[b]; shade[b] = t;
    t = life[a]; life[a] = life[b]; life[b] = t;
    t = burn[a]; burn[a] = burn[b]; burn[b] = t;
    t = vel[a]; vel[a] = vel[b]; vel[b] = t;
    t = vx[a]; vx[a] = vx[b]; vx[b] = t;
    t = vy[a]; vy[a] = vy[b]; vy[b] = t;
    t = temp[a]; temp[a] = temp[b]; temp[b] = t;
    t = charge[a]; charge[a] = charge[b]; charge[b] = t;
    t = pinned[a]; pinned[a] = pinned[b]; pinned[b] = t;
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
    this.charge.fill(0);
    this.pinned.fill(0);
    this.stasisCount = this.stasisNextCount = 0;
    this.gatesFound = this.gatesNextCount = 0;
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
   * clears everything; Fire also sets flammable cells alight; Lightning sparks conductors. Loose materials are scattered a
   * little so they look poured rather than stamped.
   */
  paint(cx: number, cy: number, radius: number, m: MaterialId): void {
    const r = Math.max(0, Math.floor(radius));
    const r2 = r * r + r;
    const kind = MATS[m].kind;
    // Drawn fixed, a powder goes down solid, as drawn; otherwise loose materials are scattered a little.
    const pin = this.drawFixed && PINNABLE[m] === 1;
    const scatter = r === 0 || kind === 'static' || pin ? 1 : 0.5;
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
          if (this.rng.chance(scatter)) {
            this.setCell(i, m);
            if (pin) this.pinned[i] = 1;
          }
        } else if (m === M.Fire) {
          this.ignite(i);
        } else if (m === M.Lightning) {
          this.electrify(i);
        }
      }
    }
  }

  /**
   * Draw material m into each of the first `count` cells listed (from rasterShape), by the brush's
   * rules but solid, with no scattering: the shape tools.
   */
  paintCells(cells: Int32Array, count: number, m: MaterialId): void {
    const pin = this.drawFixed && PINNABLE[m] === 1;
    for (let k = 0; k < count; k++) {
      const i = cells[k];
      const t = this.mat[i];
      if (m === M.Empty) {
        if (t !== M.Empty) this.setCell(i, M.Empty);
      } else if (t === M.Empty) {
        this.setCell(i, m);
        if (pin) this.pinned[i] = 1;
      } else if (m === M.Fire) {
        this.ignite(i);
      } else if (m === M.Lightning) {
        this.electrify(i);
      }
    }
  }

  /**
   * The replace brush: within the disc, turn every cell of material `from` into `to` (or, if `from`
   * is Empty, every cell that isn't empty). Empty space stays empty.
   */
  replace(cx: number, cy: number, radius: number, from: MaterialId, to: MaterialId): void {
    const r = Math.max(0, Math.floor(radius));
    const r2 = r * r + r;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= this.width || dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        const t = this.mat[i];
        if (t === M.Empty || t === to || (from !== M.Empty && t !== from)) continue;
        this.setCell(i, to);
        if (this.drawFixed && PINNABLE[to] === 1) this.pinned[i] = 1;
      }
    }
  }

  /** The replace brush along a line, for smooth strokes when the pointer moves fast. */
  replaceLine(x0: number, y0: number, x1: number, y1: number, radius: number, from: MaterialId, to: MaterialId): void {
    const dist = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const stride = Math.max(1, Math.floor(radius / 2));
    const steps = Math.max(1, Math.ceil(dist / stride));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.replace(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), radius, from, to);
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

  /** Start an electric pulse in cell i if it conducts and isn't already charged. Returns true if it did. */
  electrify(i: number): boolean {
    if (!CONDUCTS[this.mat[i]] || this.charge[i] !== 0) return false;
    this.charge[i] = CHARGE_ACTIVE;
    return true;
  }

  /**
   * Whether a pulse has just arrived beside (x, y): a neighbouring conductor's charge is active,
   * having reached it in this frame's electricity pass. (A pulse a cell sent out itself has already
   * cooled a step by its next turn, so this sees only pulses coming in.)
   */
  pulseBeside(x: number, y: number): boolean {
    const { width: w, charge } = this;
    return (
      (x > 0 && charge[y * w + x - 1] === CHARGE_ACTIVE) ||
      (x < w - 1 && charge[y * w + x + 1] === CHARGE_ACTIVE) ||
      (y > 0 && charge[(y - 1) * w + x] === CHARGE_ACTIVE) ||
      (y < this.height - 1 && charge[(y + 1) * w + x] === CHARGE_ACTIVE)
    );
  }

  /** Whether sunlight reaches (x, y): the sun is out and everything above it lets light through. */
  inSunlight(x: number, y: number): boolean {
    if (this.sun <= 0 || !this.inBounds(x, y)) return false;
    for (let i = (y - 1) * this.width + x; i >= 0; i -= this.width) if (!TRANSPARENT[this.mat[i]]) return false;
    return true;
  }

  /** Give each flammable neighbour of (x, y) its own chance (its flammability) of catching fire. */
  igniteNeighbours(x: number, y: number): void {
    // Plain index loops (no destructuring): this runs for every burning cell, every frame.
    const { width: w, height: h, mat, burn } = this;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k];
      const ny = y + DY8[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      const t = mat[n];
      if (FLAMMABLE[t] && burn[n] === 0 && this.rng.chance(MATS[t].flammability)) this.ignite(n);
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
    this.noise.blasts++;
    if (r > this.noise.blastRadius) this.noise.blastRadius = r;
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
          if (GLASSY[def.id]) this.noise.shatters++;
          // A diamond crushed in a blast, now and then, collapses into a gravity knot.
          if (def.id === M.Diamond && this.rng.chance(0.25)) {
            this.setCell(i, M.GravityKnot);
            continue;
          }
          if (def.shattersInto !== undefined) this.setCell(i, def.shattersInto);
          else if (!def.indestructible) this.setCell(i, this.rng.chance(0.25) ? M.Fire : M.Empty);
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
        // Fish at the edge of a blast are stunned: they float up, and come round a little later.
        if (def.id === M.Fish) this.vel[i] = FISH_STUN;
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
    this.ventBudget = MAX_VENT_CELLS_PER_FRAME;
    this.stepping = true;
    this.updateTemperature();
    this.updateElectricity();
    if (this.dayLength > 0) this.sun = sunAt(this.dayClock++, this.dayLength);
    if (this.gusty) this.wind = gustAt(this.frame);
    if (this.sun !== 0) this.updateSunlight();
    if (this.openEdges) this.drainEdges();
    // The stasis pockets that registered last frame slow time around them this frame.
    this.stasisX.set(this.stasisNextX);
    this.stasisY.set(this.stasisNextY);
    this.stasisCount = this.stasisNextCount;
    this.stasisNextCount = 0;
    this.gates.set(this.gatesNext);
    this.gatesFound = this.gatesNextCount;
    this.gatesNextCount = 0;
    const stasis = this.stasisCount > 0;
    const { width: w, height: h, mat, stamp } = this;
    const f = this.frame;
    const leftToRight = (f & 1) === 0;
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let k = 0; k < w; k++) {
        const x = leftToRight ? k : w - 1 - k;
        const i = row + x;
        const m = mat[i];
        if (m === EMPTY || stamp[i] === f || (INERT[m] && this.burn[i] === 0)) continue;
        if (stasis && m !== STASIS && (f + i) % STASIS_SLOW !== 0 && this.inStasis(x, y)) continue;
        this.updateCell(x, y, i, MATS[m]);
      }
    }
    this.stepping = false;
  }

  /**
   * With open edges, whatever has reached an edge it can leave by is gone (see `openEdges`): the
   * bottom row loses its sand, liquids and creatures, the side columns anything that isn't solid,
   * and the top row its gases. Clouds only leave by a side the wind blows towards, and never by
   * the top (they sink back down from there).
   */
  private drainEdges(): void {
    const { width: w, height: h, mat } = this;
    const bottom = (h - 1) * w;
    for (let x = 0; x < w; x++) {
      const kind = KIND[mat[bottom + x]];
      if ((kind === KIND_POWDER && this.pinned[bottom + x] === 0) || kind === KIND_LIQUID) this.setCell(bottom + x, M.Empty);
      if (KIND[mat[x]] === KIND_GAS && !IS_CLOUD[mat[x]]) this.setCell(x, M.Empty);
    }
    for (let y = 0; y < h; y++) {
      for (let side = 0; side < 2; side++) {
        const i = y * w + (side === 0 ? 0 : w - 1);
        const m = mat[i];
        const kind = KIND[m];
        if (kind === KIND_STATIC || kind === KIND_EMPTY || this.pinned[i] !== 0) continue;
        if (IS_CLOUD[m] && (this.wind === 0 || (this.wind < 0) !== (side === 0))) continue;
        this.setCell(i, M.Empty);
      }
    }
  }

  /**
   * Sunlight: every 4th column each frame (taking turns), light travels down from the top through
   * anything transparent and stops at the first cell that isn't. That cell warms towards a hot
   * summer surface temperature (never cooling something already hotter), and may change in the sun.
   * Whatever lies under it is in its shade.
   *
   * At night (`sun` below 0) the same cell instead loses heat to the clear sky, towards NIGHT_CHILL
   * below ambient (never warming something colder), and may change under the night sky. A cloud,
   * fog or a roof is that first cell itself, so whatever lies under it keeps warm.
   */
  private updateSunlight(): void {
    const { width: w, height: h, mat } = this;
    const t = this.temp;
    const sun = this.sun;
    const night = sun < 0;
    const strength = night ? -sun : sun;
    const target = night ? AMBIENT - NIGHT_CHILL * strength : AMBIENT + SUN_WARMTH * sun;
    const heat = (night ? NIGHT_HEAT : SUN_HEAT) * strength;
    const chances = night ? NIGHT_CHANCE : SUNLIT_CHANCE;
    const end = w * h;
    for (let x = this.frame & 3; x < w; x += 4) {
      let i = x;
      while (i < end && TRANSPARENT[mat[i]]) i += w;
      if (i >= end) continue;
      const m = mat[i];
      if (night) {
        if (t[i] > target) t[i] = Math.max(target, t[i] - heat);
        const cold = NIGHT_COLD_TEMP[m];
        if (t[i] < cold) {
          this.transform(i, MATS[m].night!.cold!.into);
          this.noise.cracks++;
          continue;
        }
      } else if (t[i] < target) t[i] = Math.min(target, t[i] + heat);
      if (chances[m] > 0 && this.rng.chance(chances[m] * strength)) {
        const change = night ? MATS[m].night! : MATS[m].sunlit!;
        // What it sometimes leaves (salt from salt water) is left only where it's shallow (a tray,
        // a still, a drying pool): over deep water it stays dissolved, so a sea in the sun doesn't
        // fill up with salt.
        const other = change.sometimes && !this.deepBelow(i, m) ? change.sometimes : undefined;
        this.transform(i, other && this.rng.chance(other.chance) ? other.into : change.into);
      }
    }
  }

  /** Whether at least DEEP_LIQUID more cells of material m lie straight below cell i. */
  private deepBelow(i: number, m: number): boolean {
    for (let k = 1; k <= DEEP_LIQUID; k++) {
      const j = i + k * this.width;
      if (j >= this.size || this.mat[j] !== m) return false;
    }
    return true;
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
          v += (BURN_TEMP[m] - v) * 0.3;
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

  /**
   * Move electricity along conductors (see CHARGE_ACTIVE). An active cell passes its charge to idle
   * conducting neighbours, warms up, may set flammable neighbours alight, and splits neighbouring
   * fresh water into hydrogen. Charge left in a cell that no longer conducts is dropped.
   */
  private updateElectricity(): void {
    const { width: w, height: h, mat, charge } = this;
    let pending = 0;
    for (let i = 0; i < this.size; i++) {
      const c = charge[i];
      if (c === 0 || c === CHARGE_PENDING) continue;
      if (!CONDUCTS[mat[i]]) {
        charge[i] = 0;
        continue;
      }
      if (c === CHARGE_ACTIVE) {
        const x = i % w;
        const y = (i - x) / w;
        this.temp[i] += CHARGE_HEAT[mat[i]];
        for (let k = 0; k < 4; k++) {
          const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
          const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          const t = mat[n];
          if (CONDUCTS[t]) {
            if (charge[n] === 0) {
              charge[n] = CHARGE_PENDING;
              pending++;
            }
          } else if (FLAMMABLE[t]) {
            if (this.rng.chance(0.5)) this.ignite(n);
          } else if (t === M.Water && this.rng.chance(0.05)) {
            this.setCell(n, M.Hydrogen); // electrolysis
          }
        }
        // Electrified salt water gives off chlorine into the air above it.
        if (mat[i] === M.SaltWater && y > 0 && mat[i - w] === EMPTY && this.rng.chance(0.05)) {
          this.setCell(i - w, M.Chlorine);
        }
        charge[i] = RESTS[mat[i]] ? CHARGE_ACTIVE + LIQUID_REST : c - 1;
        continue;
      }
      charge[i] = c === CHARGE_ACTIVE + 1 ? 0 : c - 1;
    }
    if (pending === 0) return;
    for (let i = 0; i < this.size; i++) if (charge[i] === CHARGE_PENDING) charge[i] = CHARGE_ACTIVE;
  }

  private updateCell(x: number, y: number, i: number, def: MaterialDef): void {
    if (this.burn[i] > 0 && this.updateBurning(x, y, i, def)) return;

    // Temperature-driven changes: melting and boiling, and catching fire from heat alone.
    const t = this.temp[i];
    const above = def.above;
    // (Burning cells are hot because they're burning: they don't melt until they've stopped.)
    if (above && t > above.temp && this.burn[i] === 0) {
      if (ICY[def.id]) this.noise.cracks++;
      const touching = above.touching;
      if (touching && (this.get(x - 1, y) === touching.with || this.get(x + 1, y) === touching.with || this.get(x, y - 1) === touching.with || this.get(x, y + 1) === touching.with)) {
        this.transform(i, touching.into);
        return;
      }
      const other = above.sometimes;
      this.transform(i, other && this.rng.chance(other.chance) ? other.into : above.into);
      return;
    }
    const below = def.below;
    if (below && t < below.temp) {
      this.transform(i, below.into);
      return;
    }
    if (def.ignitesAt !== undefined && this.burn[i] === 0 && t >= def.ignitesAt && this.ignite(i)) return;

    if (def.reactions && this.react(x, y, i, def.reactions)) return;

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
        // Drawn fixed: it stays put.
        if (this.pinned[i] === 0) this.movePowder(x, y, i, def);
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

  /** Try this cell's reactions against one random neighbour. Returns true if the cell changed. */
  private react(x: number, y: number, i: number, reactions: readonly Reaction[]): boolean {
    const k = this.rng.int(0, 3);
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (!this.inBounds(nx, ny)) return false;
    const n = ny * this.width + nx;
    const other = this.mat[n];
    for (let r = 0; r < reactions.length; r++) {
      const re = reactions[r];
      if (re.with !== other || (re.whileBurning && this.burn[i] === 0)) continue;
      if (re.side && re.side !== (k === 2 ? 'above' : k === 3 ? 'below' : 'beside')) continue;
      if (re.minTemp !== undefined && this.temp[i] < re.minTemp) continue;
      if (!this.rng.chance(re.chance)) continue;
      if (re.otherInto !== undefined) this.transform(n, re.otherInto);
      if (re.into !== undefined) {
        this.transform(i, re.into);
        return true;
      }
      return false;
    }
    return false;
  }

  /** One frame of a burning cell. Returns true if the cell burned out (or exploded). */
  private updateBurning(x: number, y: number, i: number, def: MaterialDef): boolean {
    for (const [dx, dy] of N4) {
      const t = this.get(x + dx, y + dy);
      if (!EXTINGUISHES[t] || !this.inBounds(x + dx, y + dy)) continue;
      // Carbon dioxide only smothers a burning cell once it has cut off the air entirely.
      if (t === M.CarbonDioxide && this.touchesAir(x, y)) continue;
      const n = this.idx(x + dx, y + dy);
      // Water boils away into steam and foam pops; carbon dioxide just smothers and stays.
      const usedUp = t === M.Water || t === M.SaltWater ? M.Steam : t === M.Foam ? M.Empty : -1;
      if (this.rng.chance(def.extinguishChance)) {
        this.burn[i] = 0;
        if (usedUp >= 0 && this.rng.chance(0.5)) this.setCell(n, usedUp as MaterialId);
        return false;
      }
      // Too hot to put out: the water slowly boils (or the foam pops) instead.
      if (usedUp >= 0 && this.rng.chance(0.04)) this.setCell(n, usedUp as MaterialId);
      break;
    }

    if (--this.burn[i] <= 0) {
      const ex = def.explosive;
      if (ex && (ex.chance === undefined || this.rng.chance(ex.chance))) {
        this.detonate(x, y, i, def);
      } else {
        const residue = def.residue;
        const other = residue?.sometimes;
        this.setCell(
          i,
          other && this.rng.chance(other.chance) ? other.into : residue && this.rng.chance(residue.chance) ? residue.into : def.burnsInto,
        );
      }
      return true;
    }

    this.igniteNeighbours(x, y);
    // Bellows: in the wind, embers carry a cell or two downwind, so a fire races before the wind.
    if (this.wind !== 0 && this.rng.chance(Math.abs(this.wind) * 0.3)) {
      const ex = x + (this.wind > 0 ? 1 : -1) * this.rng.int(1, 2);
      const ey = y - this.rng.int(0, 1);
      if (this.inBounds(ex, ey)) {
        const n = ey * this.width + ex;
        if (this.rng.chance(MATS[this.mat[n]].flammability)) this.ignite(n);
      }
    }

    // Flames and a little smoke (or other fumes) above the burning cell.
    if (this.rng.chance(def.flames)) {
      const fx = x + this.rng.int(-1, 1);
      if (this.get(fx, y - 1) === M.Empty) this.set(fx, y - 1, M.Fire);
    } else if (this.rng.chance(0.02) && this.get(x, y - 1) === M.Empty) {
      this.set(x, y - 1, def.fumes ?? M.Smoke);
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
    // In the wind, a light grain on top of a pile or on its windward face is now and then blown up
    // into the air and carried off downwind (sawdust, ash), stripping the pile grain by grain.
    if (this.wind !== 0 && LOFTS[def.id] > 0 && this.rng.chance(LOFTS[def.id] * Math.abs(this.wind))) {
      const d = this.wind > 0 ? 1 : -1;
      if ((this.get(x, y - 1) === EMPTY || this.get(x - d, y) === EMPTY) && this.get(x + d, y - 1) === EMPTY) {
        const n = this.idx(x + d, y - 1);
        this.swap(i, n);
        // The lighter the powder (the more readily it lofts), the higher and further it's thrown.
        const w = Math.abs(this.wind) * (1 + LOFTS[def.id] * 4);
        this.launch(n, d * w * (1 + this.rng.next() * 2), -(0.4 + this.rng.next() * 0.8) * w);
        return;
      }
    }
    // In the wind, an exposed grain is now and then lifted a cell downwind: dunes creep, snow drifts.
    if (this.wind !== 0 && DRIFTS[def.id] > 0 && this.rng.chance(DRIFTS[def.id] * Math.abs(this.wind))) {
      const d = this.wind > 0 ? 1 : -1;
      if (this.get(x, y - 1) === EMPTY && this.get(x + d, y - 1) === EMPTY) {
        this.swap(i, this.idx(x + d, y - 1));
        return;
      }
    }
    // Sticky powders (clay) hold on to their own kind at either side, and otherwise rarely slide.
    if (def.viscosity > 0) {
      if (this.get(x - 1, y) === def.id || this.get(x + 1, y) === def.id || this.rng.chance(def.viscosity)) return;
    }
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
        if (this.openEdges) {
          // Flown off the grid through an open edge: gone.
          this.setCell(ci, M.Empty);
          return true;
        }
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

/**
 * The sun at `clock` frames after the first sunrise, in a day and night `length` frames long: up
 * through the morning to full sun at midday and down to sunset halfway through, then a clear night,
 * coldest at midnight. It rises and sets quickly (the sine is scaled up and clipped), so most of
 * the day is bright and most of the night properly dark.
 */
export function sunAt(clock: number, length: number): number {
  const s = Math.sin((2 * Math.PI * (clock % length)) / length) * 1.6;
  return s > 1 ? 1 : s < -1 ? -1 : s;
}

/**
 * Gusty wind at a given frame: three slow waves with unrelated periods, so it swells and drops,
 * lulls now and then, and every so often swings round to blow the other way. Mostly between light
 * and strong; -1 to 1 like `World.wind`.
 */
export function gustAt(frame: number): number {
  const v = 0.75 * Math.sin(frame * 0.0023) + 0.4 * Math.sin(frame * 0.0107 + 1.3) + 0.25 * Math.sin(frame * 0.041 + 0.7);
  return v > 1 ? 1 : v < -1 ? -1 : v;
}
