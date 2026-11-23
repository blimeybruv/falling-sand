/**
 * Example scenes: a handful of ready-made worlds that show what the game can do, offered from the
 * Scene menu. Each is built in code from fractions of the grid, so it fits any screen size. They're
 * placed like a loaded scene (nothing counts as discovered) into a cleared world.
 */
import { M, type MaterialId } from './ids';
import type { World } from './world';

export interface Example {
  id: string;
  name: string;
  /** One line shown when it loads: what to watch for, or what to try. */
  hint: string;
  build(w: World): void;
}

/** Fill the box between fractions (fx0, fy0) and (fx1, fy1) of the grid with m. */
function box(w: World, fx0: number, fy0: number, fx1: number, fy1: number, m: MaterialId): void {
  const x0 = Math.round(fx0 * w.width);
  const x1 = Math.round(fx1 * w.width);
  const y0 = Math.round(fy0 * w.height);
  const y1 = Math.round(fy1 * w.height);
  for (let y = Math.max(0, y0); y < Math.min(w.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w.width, x1); x++) w.setCell(y * w.width + x, m);
}

/** Set one cell (in grid cells, not fractions), if it's on the grid. */
function cell(w: World, x: number, y: number, m: MaterialId): void {
  if (w.inBounds(x, y)) w.setCell(w.idx(x, y), m);
}

/** A mound: a hill rising to `peak` (fraction from the top) at fx, with sides falling away over `half` (fraction of width). */
function mound(w: World, fx: number, half: number, peak: number, base: number, m: MaterialId): void {
  const cx = fx * w.width;
  const hw = half * w.width;
  const top = peak * w.height;
  const bottom = base * w.height;
  for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const d = Math.abs(x - cx) / hw;
    if (d > 1) continue;
    const yTop = Math.round(top + (bottom - top) * d * d);
    for (let y = yTop; y < bottom; y++) cell(w, x, y, m);
  }
}

/** A tree: a trunk from the ground at (x, ground) up `height` cells, under a round crown of leaves. */
function tree(w: World, x: number, ground: number, height: number): void {
  for (let y = ground - height; y < ground; y++) {
    cell(w, x, y, M.Wood);
    cell(w, x + 1, y, M.Wood);
  }
  const r = Math.max(3, Math.round(height * 0.45));
  const cy = ground - height;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (dx * dx * 0.8 + dy * dy * 1.3 <= r * r) cell(w, x + dx, cy + dy, M.Leaf);
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'volcano',
    name: 'Volcano island',
    hint: 'A volcano in the sea: lava wells up from the vent, hisses into steam where it meets the water and crusts into basalt.',
    build(w) {
      box(w, 0, 0.82, 1, 1, M.SaltWater);
      box(w, 0, 0.95, 1, 1, M.Sand);
      mound(w, 0.5, 0.3, 0.42, 0.95, M.Sand);
      mound(w, 0.5, 0.22, 0.38, 0.95, M.Stone);
      mound(w, 0.5, 0.12, 0.36, 0.95, M.Basalt);
      // A lava chamber in the heart of the cone, a throat up to the crater, and the vent just under
      // the crater's pool (a vent releases into open air only a little way above it).
      box(w, 0.47, 0.62, 0.53, 0.8, M.Lava);
      box(w, 0.49, 0.4, 0.51, 0.62, M.Lava);
      box(w, 0.48, 0.33, 0.52, 0.4, M.Empty);
      box(w, 0.49, 0.38, 0.51, 0.4, M.Lava);
      cell(w, Math.round(0.5 * w.width), Math.round(0.41 * w.height), M.VolcanicVent);
      for (let x = 0.05; x < 0.3; x += 0.04) cell(w, Math.round(x * w.width), Math.round(0.94 * w.height), M.Seaweed);
    },
  },
  {
    id: 'charges',
    name: 'Fuse and charges',
    hint: 'A battery sends a pulse down the copper wire, which lights a gunpowder fuse leading to three charges. Stand back.',
    build(w) {
      box(w, 0, 0.92, 1, 1, M.Stone);
      // Three pillars, each with a charge of dynamite on top.
      for (const fx of [0.45, 0.62, 0.79]) {
        box(w, fx - 0.03, 0.72, fx + 0.03, 0.92, M.Stone);
        box(w, fx - 0.025, 0.64, fx + 0.025, 0.72, M.Dynamite);
      }
      // The battery, a long copper wire, and the fuse along the ground and up to each charge.
      box(w, 0.06, 0.84, 0.1, 0.92, M.Battery);
      box(w, 0.1, 0.9, 0.38, 0.92, M.Copper);
      box(w, 0.38, 0.905, 0.82, 0.92, M.Gunpowder);
      for (const fx of [0.45, 0.62, 0.79]) box(w, fx + 0.03, 0.66, fx + 0.035, 0.905, M.Gunpowder);
    },
  },
  {
    id: 'pond',
    name: 'Pond life',
    hint: 'Fish feed on the algae, worms work the loam, and in time a seagull or a crow comes for them. Try the Sun menu, or some rain.',
    build(w) {
      box(w, 0, 0.8, 1, 1, M.Loam);
      box(w, 0.25, 0.78, 0.75, 0.97, M.Water);
      box(w, 0, 0.78, 0.25, 0.8, M.Grass);
      box(w, 0.75, 0.78, 1, 0.8, M.Grass);
      const surface = Math.round(0.78 * w.height);
      for (let fx = 0.3; fx < 0.72; fx += 0.06) {
        cell(w, Math.round(fx * w.width), surface, M.Algae);
        cell(w, Math.round((fx + 0.02) * w.width), Math.round(0.88 * w.height), M.Fish);
      }
      for (let fx = 0.04; fx < 1; fx += 0.08) {
        if (fx > 0.24 && fx < 0.76) continue;
        cell(w, Math.round(fx * w.width), Math.round(0.86 * w.height), M.Earthworm);
        cell(w, Math.round((fx + 0.03) * w.width), surface - 1, M.Seed);
      }
    },
  },
  {
    id: 'storm',
    name: 'Thunderstorm',
    hint: 'A storm cloud pours over the dunes. Lightning bends to the copper rod on the tower, and fuses sand into fulgurite where it lands.',
    build(w) {
      mound(w, 0.25, 0.3, 0.8, 1, M.Sand);
      mound(w, 0.8, 0.25, 0.84, 1, M.Sand);
      box(w, 0.6, 0.62, 0.64, 1, M.Stone);
      box(w, 0.615, 0.5, 0.625, 0.62, M.Copper);
      box(w, 0.08, 0.16, 0.92, 0.38, M.Cloud);
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    hint: 'Set it alight (Fire, or Lightning) and watch: the burning crowns drop pine cones, which open once the fire has passed and grow a new forest from the ash.',
    build(w) {
      box(w, 0, 0.88, 1, 1, M.Earth);
      box(w, 0, 0.86, 1, 0.88, M.Grass);
      const ground = Math.round(0.86 * w.height);
      const step = Math.max(14, Math.round(w.width / 8));
      for (let x = Math.round(step / 2); x < w.width - 4; x += step) tree(w, x, ground, Math.round(w.height * (0.22 + ((x * 7) % 5) * 0.03)));
    },
  },
];
