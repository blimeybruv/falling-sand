/**
 * Small per-material functions, referenced from the `update` field in materials.ts.
 * Each runs once per frame for each cell of its material, before the generic movement for its kind.
 * Return true if the cell was fully handled this frame (moved, transformed or removed).
 *
 * Only `import type` from world.ts here, so there is no runtime import cycle.
 */
import { M, type MaterialId } from './ids';
import type { World } from './world';

/** Fire: put out by water (becoming steam), and sets flammable neighbours alight. */
export function updateFire(w: World, x: number, y: number, i: number): boolean {
  if (
    w.get(x, y - 1) === M.Water ||
    w.get(x, y + 1) === M.Water ||
    w.get(x - 1, y) === M.Water ||
    w.get(x + 1, y) === M.Water
  ) {
    w.setCell(i, M.Steam);
    return true;
  }
  w.igniteNeighbours(x, y);
  return false;
}

/** Steam: condenses back into water (some freezing to ice) near the top of the grid, or under a solid ceiling. */
export function updateSteam(w: World, x: number, y: number, i: number): boolean {
  const nearTop = y < w.height * 0.1;
  if (nearTop && w.rng.chance(0.01)) {
    // Up in the cold, some of it freezes straight to frost.
    w.setCell(i, w.rng.chance(0.08) ? M.Ice : M.Water);
    return true;
  }
  if (w.isSolid(x, y - 1) && w.rng.chance(0.004)) {
    w.setCell(i, M.Water);
    return true;
  }
  return false;
}

/** How far (in cells) water can be for ground to count as damp, for seeds and grass. */
const DAMP_RANGE = 6;

/** Grass: now and then spreads into neighbouring water, or over neighbouring open ground (see below). */
export function growGrass(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.03)) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  const t = w.get(nx, ny);
  if (t === M.Water) {
    w.set(nx, ny, M.Grass);
  } else if ((t === M.Sand || t === M.Earth || t === M.Loam) && w.get(nx, ny - 1) === M.Empty) {
    // Creeps over open ground: loam always, sand and earth only where it's damp.
    if (t === M.Loam || w.near(nx, ny, DAMP_RANGE, M.Water)) w.set(nx, ny, M.Grass);
  }
  return true;
}

/** Sand: a sand surface (open air above) at the water's edge occasionally sprouts grass. */
export function sproutGrass(w: World, x: number, y: number, i: number): boolean {
  if (!w.rng.chance(0.002) || w.get(x, y - 1) !== M.Empty) return false;
  if (
    w.get(x - 1, y) === M.Water ||
    w.get(x + 1, y) === M.Water ||
    w.get(x - 1, y + 1) === M.Water ||
    w.get(x + 1, y + 1) === M.Water
  ) {
    w.transform(i, M.Grass);
    return true;
  }
  return false;
}

/**
 * Seed. A falling seed is a powder. Resting on loam, or on damp sand, earth or grass, with room
 * above, it sprouts (taller on loam):
 * `life` becomes the height left to grow, and the seed turns into the growing tip of a tree,
 * which climbs a cell at a time leaving wood behind, puts out the odd branch, and finishes with
 * a crown of leaves.
 */
export function updateSeed(w: World, x: number, y: number, i: number): boolean {
  const height = w.life[i];
  if (height > 0) return growTree(w, x, y, i, height);
  if (!w.rng.chance(0.02)) return false;
  if (w.get(x, y - 1) !== M.Empty) return false;
  const below = w.get(x, y + 1);
  if (below === M.Loam) {
    w.life[i] = w.rng.int(28, 46);
    return true;
  }
  if ((below === M.Sand || below === M.Earth || below === M.Grass) && w.near(x, y, DAMP_RANGE, M.Water)) {
    w.life[i] = w.rng.int(18, 34);
    return true;
  }
  return false;
}

function growTree(w: World, x: number, y: number, i: number, height: number): boolean {
  if (!w.rng.chance(0.2)) return true; // grows slowly, and stays put while it does
  const nx = w.rng.chance(0.15) ? x + w.rng.sign() : x; // a slight lean now and then
  const above = w.get(nx, y - 1);
  w.setCell(i, M.Wood);
  if (height > 1 && (above === M.Empty || above === M.Leaf)) {
    w.set(nx, y - 1, M.Seed);
    if (w.inBounds(nx, y - 1)) w.life[w.idx(nx, y - 1)] = height - 1;
    if (height > 5 && height < 30 && w.rng.chance(0.25)) growBranch(w, x, y, w.rng.sign());
  } else {
    growCrown(w, x, y - 1, w.rng.int(5, 7));
  }
  return true;
}

function growBranch(w: World, x: number, y: number, dir: number): void {
  let bx = x;
  let by = y;
  const length = w.rng.int(3, 6);
  for (let k = 0; k < length; k++) {
    bx += dir;
    if (k % 2 === 1) by--;
    if (w.get(bx, by) !== M.Empty) return;
    w.set(bx, by, M.Wood);
  }
  growCrown(w, bx, by - 1, w.rng.int(2, 4));
}

function growCrown(w: World, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      if (w.get(cx + dx, cy + dy) === M.Empty && w.rng.chance(0.85)) w.set(cx + dx, cy + dy, M.Leaf);
    }
  }
}

/**
 * A three-way mix: when cell i has both `a` and `b` within 2 cells, now and then all three
 * (cell i, one `a` and one `b`) turn into `into`. Used by loam and gunpowder.
 */
function mixThree(w: World, x: number, y: number, i: number, a: MaterialId, b: MaterialId, into: MaterialId): boolean {
  if (!w.rng.chance(0.05)) return false;
  let foundA = -1;
  let foundB = -1;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!w.inBounds(x + dx, y + dy)) continue;
      const t = w.get(x + dx, y + dy);
      if (t === a) foundA = w.idx(x + dx, y + dy);
      else if (t === b) foundB = w.idx(x + dx, y + dy);
    }
  }
  if (foundA < 0 || foundB < 0) return false;
  w.transform(i, into);
  w.transform(foundA, into);
  w.transform(foundB, into);
  return true;
}

/** Earth: with sand and clay close by, now and then the three turn into loam. */
export function formLoam(w: World, x: number, y: number, i: number): boolean {
  return mixThree(w, x, y, i, M.Sand, M.Clay, M.Loam);
}

/** Charcoal: with sulfur and saltpetre close by, now and then the three turn into gunpowder. */
export function formGunpowder(w: World, x: number, y: number, i: number): boolean {
  return mixThree(w, x, y, i, M.Sulfur, M.Saltpetre, M.Gunpowder);
}

/** Wood and leaves: buried under sand (nothing open around them), they very slowly turn into oil. */
export function fossilise(w: World, x: number, y: number, i: number): boolean {
  if (!w.rng.chance(0.0005) || w.get(x, y - 1) !== M.Sand) return true;
  if (w.get(x - 1, y) === M.Empty || w.get(x + 1, y) === M.Empty || w.get(x, y + 1) === M.Empty) return true;
  w.transform(i, M.Oil);
  return true;
}

/** Acid: now and then eats a neighbouring cell, sometimes using itself up. */
export function corrode(w: World, x: number, y: number, i: number): boolean {
  if (!w.rng.chance(0.2)) return false;
  // Mostly downwards and sideways, like acid eating into what it sits on.
  const r = w.rng.int(0, 3);
  const nx = r === 1 ? x - 1 : r === 2 ? x + 1 : x;
  const ny = r === 0 ? y + 1 : r === 3 ? y - 1 : y;
  if (!w.inBounds(nx, ny)) return false;
  const target = w.defAt(nx, ny);
  if (
    target.indestructible ||
    target.acidProof ||
    target.kind === 'empty' ||
    target.kind === 'gas' ||
    target.id === M.Acid ||
    target.id === M.Water
  ) {
    return false;
  }
  w.set(nx, ny, w.rng.chance(0.2) ? M.Smoke : M.Empty);
  if (w.rng.chance(0.3)) {
    w.setCell(i, M.Empty);
    return true;
  }
  return false;
}

/**
 * Lava: sets neighbours alight. Where it meets water the water boils and the lava sets to stone
 * (or, now and then, sulfur); where it meets ice it sets to obsidian.
 */
export function updateLava(w: World, x: number, y: number, i: number): boolean {
  w.igniteNeighbours(x, y);
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    const n = w.get(nx, ny);
    if (n === M.Water) {
      if (w.rng.chance(0.5)) w.transform(w.idx(nx, ny), M.Steam);
      if (w.rng.chance(0.2)) {
        // Mostly stone; now and then a yellow sulfur deposit (cool, so it doesn't catch at once).
        if (w.rng.chance(0.2)) w.setCell(i, M.Sulfur);
        else w.transform(i, M.Stone);
        return true;
      }
    } else if (n === M.Ice) {
      // Ice chills it so fast it sets as glassy obsidian.
      w.transform(w.idx(nx, ny), M.Water);
      if (w.rng.chance(0.3)) {
        w.transform(i, M.Obsidian);
        return true;
      }
    }
  }
  return false;
}

/** Ice: while it is below freezing, now and then turns a neighbouring water cell to ice. */
export function freezeWater(w: World, x: number, y: number, i: number): boolean {
  if (w.temp[i] >= 0 || !w.rng.chance(0.01)) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  if (w.get(nx, ny) === M.Water) w.set(nx, ny, M.Ice);
  return true;
}
