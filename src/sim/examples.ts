/**
 * Example scenes: a handful of ready-made worlds that show what the game can do, offered from the
 * Scene menu. Each is built in code from fractions of the grid, so it fits any screen size. They're
 * placed like a loaded scene (nothing counts as discovered) into a cleared world.
 */
import { M, type MaterialId } from './ids';
import type { World } from './world';
import { PINE_SEED } from './behaviours';

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

/** Fill an ellipse centred at (cx, cy) with radii (rx, ry), in grid cells, where `only` (if given) is. */
function blob(w: World, cx: number, cy: number, rx: number, ry: number, m: MaterialId, only?: MaterialId): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1 || !w.inBounds(x, y)) continue;
      if (only !== undefined && w.mat[w.idx(x, y)] !== only) continue;
      w.setCell(w.idx(x, y), m);
    }
  }
}

/**
 * The primordial wilderness: untouched prehistoric land, different each time it loads (it's drawn
 * from the world's random numbers; share it with a link to keep one). From left to right: a sea with
 * a sandy shore and seaweed, rolling loam hills with grass and trees around a peat bog, and a
 * smouldering volcano. Beneath: layered rock with ore veins, a coal seam, a buried oil pocket and a
 * cave with stalactites, on basalt bedrock. Storm clouds gather over it all.
 */
function wilderness(w: World): void {
  const { width: W, height: H, rng } = w;
  // Rolling hills: a few random sine waves.
  const waves = [0, 1, 2].map(() => ({ k: (1 + rng.next() * 3) * Math.PI * 2, p: rng.next() * Math.PI * 2, a: 0.012 + rng.next() * 0.02 }));
  const sea = 0.26 + rng.next() * 0.04;
  const shore = sea + 0.08;
  const volcanoAt = 0.78 + rng.next() * 0.06;
  const bogAt = shore + 0.12 + rng.next() * (volcanoAt - shore - 0.36);
  const seaLevel = Math.round(H * 0.66);
  // The hills' surface row at column x (before the volcano rises out of them).
  const hills = (x: number): number => {
    const f = x / W;
    let g = 0.62;
    for (const { k, p, a } of waves) g += Math.sin(f * k + p) * a;
    if (f < sea) g = 0.8;
    else if (f < shore) g = 0.8 + ((f - sea) / (shore - sea)) * (g - 0.8);
    // The bog: a hollow in the hills.
    const b = Math.abs(f - bogAt) / 0.06;
    if (b < 1) g += 0.025 * (1 - b * b);
    return Math.round(g * H);
  };
  // The volcano: a stratovolcano rising out of the hills, steep near the top and spreading into
  // gentle flanks (a concave profile), with a bowl-shaped crater at the summit.
  const peak = Math.round(H * (0.31 + rng.next() * 0.04));
  const reach = 0.15;
  const craterWidth = 0.13;
  const craterDepth = Math.max(3, Math.round(H * 0.022));
  /** How far column x is from the volcano's centre, as a fraction of its reach (1 or more: outside it). */
  const fromCone = (x: number): number => Math.abs(x / W - volcanoAt) / reach;
  const surface = (x: number): number => {
    const ground = hills(x);
    const d = fromCone(x);
    if (d >= 1) return ground;
    const slope = (t: number): number => peak + (ground - peak) * (1 - (1 - t) ** 1.8);
    // Inside the rim, a bowl sunk below it; outside, the slope.
    const y = d < craterWidth ? slope(craterWidth) + craterDepth * (1 - (d / craterWidth) ** 2) : slope(d);
    return Math.min(ground, Math.round(y));
  };
  const rock = new Int32Array(W);
  for (let x = 0; x < W; x++) {
    const top = surface(x);
    const ground = hills(x);
    const f = x / W;
    const d = fromCone(x);
    // Soil covers the hills and the volcano's lower flanks; higher up it's bare rock.
    const soil = f < shore || d < 0.75 ? 0 : 5 + Math.round(rng.next() * 2);
    rock[x] = top + soil;
    for (let y = top; y < H; y++) {
      let m: MaterialId = M.Stone;
      if (y >= H - Math.max(3, Math.round(H * 0.04))) m = M.Basalt;
      else if (y < top + soil) m = y === top ? M.Grass : y < top + 3 ? M.Loam : M.Earth;
      else if (f < shore + 0.02 && y < top + 4) m = M.Sand;
      else if (d < 1 && y < ground + 2) {
        // The cone: old lava flows and ash falls in layers following its slope, under a basalt crust.
        const layer = Math.floor((y - top) / 4 + Math.sin(x * 0.7) * 0.3);
        m = y === top ? M.Basalt : layer % 6 === 5 ? M.Ash : layer % 2 === 0 ? M.Basalt : M.Stone;
      }
      // Strata: wavy bands of basalt through the stone.
      else if (Math.abs(((y + Math.sin(f * 9) * 4) % 23) - 11) < 1) m = M.Basalt;
      cell(w, x, y, m);
    }
    if (f < shore) for (let y = seaLevel; y < top; y++) cell(w, x, y, M.SaltWater);
  }
  // A sandy sea floor, with seaweed.
  for (let x = 0; x < Math.round(sea * W); x++) {
    const top = surface(x);
    for (let y = top; y < top + 3; y++) cell(w, x, y, M.Sand);
    if (rng.chance(0.06)) cell(w, x, top - 1, M.Seaweed);
  }
  const deep = (fy: number): number => Math.round(fy * H);
  // Ore veins, coal and gold flecks, a diamond or two deep down: only ever in the stone.
  for (let k = 0; k < Math.max(4, Math.round(W / 40)); k++) {
    const x = rng.int(0, W - 1);
    const y = rock[x] + 6 + rng.int(0, Math.max(1, H - rock[x] - 14));
    const ore = rng.chance(0.5) ? M.IronOre : M.CopperOre;
    blob(w, x, y, 2 + rng.next() * 5, 1 + rng.next() * 2, ore, M.Stone);
  }
  for (let k = 0; k < Math.max(3, Math.round(W / 60)); k++) {
    const x = rng.int(0, W - 1);
    blob(w, x, Math.min(H - 6, rock[x] + rng.int(8, Math.max(9, Math.round(H * 0.15)))), 1 + rng.next() * 2, 1 + rng.next(), M.Gold, M.Stone);
  }
  for (let k = 0; k < 2; k++) {
    const x = rng.int(0, W - 1);
    cell(w, x, H - Math.max(5, Math.round(H * 0.06)), M.Diamond);
  }
  // A coal seam under the hills.
  {
    const x0 = Math.round((shore + 0.05) * W);
    const x1 = Math.round((bogAt + 0.1) * W);
    const y0 = Math.min(H - 8, deep(0.78));
    for (let x = x0; x < x1; x++) for (let y = y0; y < y0 + 3; y++) if (w.inBounds(x, y) && w.mat[w.idx(x, y)] === M.Stone) cell(w, x, y + Math.round(Math.sin(x / 9) * 2), M.Coal);
  }
  // A buried oil pocket.
  blob(w, (shore + 0.08) * W, Math.min(H - 8, deep(0.88)), Math.max(4, W * 0.04), Math.max(2, H * 0.025), M.Oil, M.Stone);
  // A cave with stalactites and a small pool.
  {
    const cx = Math.round(((bogAt + volcanoAt) / 2) * W);
    const cy = Math.min(H - 10, Math.max(rock[cx] + 8, deep(0.8)));
    const rx = Math.max(6, W * 0.06);
    const ry = Math.max(3, H * 0.04);
    blob(w, cx, cy, rx, ry, M.Empty);
    for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
      // The ceiling: the first empty cell from the top of the cave.
      let y = Math.floor(cy - ry);
      while (y < cy && w.get(x, y) !== M.Empty) y++;
      if (y < cy && rng.chance(0.3)) for (let k = rng.int(1, 3); k > 0; k--) cell(w, x, y++, M.Stalactite);
    }
    blob(w, cx, cy + ry - 1, rx * 0.4, 1.5, M.Water, M.Empty);
  }
  // The peat bog: peat in the hollow, water standing on it up to the lower rim, moss round the edge.
  {
    const x0 = Math.round((bogAt - 0.06) * W);
    const x1 = Math.round((bogAt + 0.06) * W);
    const rim = Math.max(surface(x0), surface(x1)) + 1;
    for (let x = x0; x < x1; x++) {
      const top = surface(x);
      for (let y = top; y < top + 4; y++) cell(w, x, y, M.Peat);
      for (let y = rim; y < top; y++) cell(w, x, y, M.Water);
      if (top <= rim && rng.chance(0.5)) cell(w, x, top - 1, M.Moss);
    }
  }
  // Trees on the hills, away from the bog.
  const step = Math.max(9, Math.round(W / 24));
  for (let x = Math.round((shore + 0.04) * W); x < (volcanoAt - 0.19) * W; x += step + rng.int(-3, 3)) {
    if (Math.abs(x / W - bogAt) < 0.065) continue;
    tree(w, x, surface(x), Math.round(H * (0.07 + rng.next() * 0.06)));
  }
  // Under the volcano: a magma chamber, a narrow winding throat up to the crater, a lava pool in the
  // crater, and the vent just under the pool (a vent releases only into open air close above it).
  {
    const cx = Math.round(volcanoAt * W);
    const floor = surface(cx);
    const rx = Math.max(5, W * 0.045);
    const ry = Math.max(4, H * 0.045);
    const cy = Math.min(H - Math.max(4, Math.round(H * 0.04)) - ry - 2, hills(cx) + H * 0.1);
    blob(w, cx, cy, rx, ry, M.Lava);
    for (let y = floor + 1; y <= cy; y++) {
      const tx = cx + Math.round(Math.sin(y * 0.22) * 1.5);
      cell(w, tx, y, M.Lava);
      cell(w, tx + 1, y, M.Lava);
    }
    const rim = surface(Math.round((volcanoAt + reach * craterWidth) * W));
    for (let x = Math.round((volcanoAt - reach * craterWidth) * W); x <= (volcanoAt + reach * craterWidth) * W; x++) {
      for (let y = rim + 1; y < surface(x); y++) cell(w, x, y, M.Lava);
    }
    cell(w, cx, floor + 1, M.VolcanicVent);
  }
  // Storm clouds gathering.
  box(w, 0.04, 0.06, 0.5, 0.06 + Math.max(0.12, 26 / H), M.Cloud);
  box(w, 0.55, 0.1, 0.7, 0.18, M.Cloud);
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'wilderness',
    name: 'Primordial wilderness',
    hint: 'Untouched land, different every time: a sea, hills and a peat bog, a smouldering volcano, and ore, coal, oil and a cave in the rock below. Dig in.',
    build: wilderness,
  },
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
    hint: 'A battery sends a pulse down the copper wire, which lights a gunpowder fuse running to three charges of dynamite. Stand back.',
    build(w) {
      box(w, 0, 0.92, 1, 1, M.Stone);
      // The battery, a long copper wire, then a gunpowder fuse along the floor (it's a powder, so it
      // has to lie on something) running into each of three charges of dynamite.
      box(w, 0.06, 0.84, 0.1, 0.92, M.Battery);
      box(w, 0.1, 0.9, 0.38, 0.92, M.Copper);
      box(w, 0.38, 0.9, 0.84, 0.92, M.Gunpowder);
      for (const fx of [0.5, 0.66, 0.82]) box(w, fx - 0.025, 0.8, fx + 0.025, 0.92, M.Dynamite);
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
  {
    id: 'grove',
    name: 'Five kinds of tree',
    hint: 'Seeds grow the tree that suits where they land: a palm on the sandy shore, a willow by the pond, a pine from the cone, a broadleaf on damp earth, a flowering tree on loam. Give them a minute.',
    build(w) {
      const ground = Math.round(0.86 * w.height);
      box(w, 0, 0.86, 1, 1, M.Earth);
      box(w, 0.6, 0.86, 1, 1, M.Loam);
      box(w, 0, 0.96, 1, 1, M.Stone);
      // The sea, walled off from a sandy shore.
      box(w, 0, 0.87, 0.14, 0.96, M.SaltWater);
      box(w, 0.14, 0.86, 0.15, 0.96, M.Stone);
      box(w, 0.15, 0.86, 0.26, 0.96, M.Sand);
      // A pond with stone banks, and damp earth beyond it.
      box(w, 0.36, 0.87, 0.44, 0.96, M.Water);
      box(w, 0.355, 0.86, 0.36, 0.96, M.Stone);
      box(w, 0.44, 0.86, 0.445, 0.96, M.Stone);
      box(w, 0.5, 0.87, 0.53, 0.9, M.Water);
      const seed = (fx: number, life: number): void => {
        const x = Math.round(fx * w.width);
        cell(w, x, ground - 1, M.Seed);
        if (w.inBounds(x, ground - 1)) w.life[w.idx(x, ground - 1)] = life;
      };
      seed(0.155, 0);
      seed(0.452, 0);
      seed(0.3, PINE_SEED);
      seed(0.56, 0);
      seed(0.82, 0);
    },
  },
];
