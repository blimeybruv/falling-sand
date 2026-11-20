/**
 * Small per-material functions, referenced from the `update` field in materials.ts.
 * Each runs once per frame for each cell of its material, before the generic movement for its kind.
 * Return true if the cell was fully handled this frame (moved, transformed or removed).
 *
 * Only `import type` from world.ts here, so there is no runtime import cycle.
 */
import { M, type MaterialId } from './ids';
import type { World } from './world';

/** Fire: put out by water and the like (becoming steam, or smoke when smothered); sets flammable neighbours alight. */
export function updateFire(w: World, x: number, y: number, i: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    const def = w.defAt(nx, ny);
    if (!def.extinguishes || !w.inBounds(nx, ny)) continue;
    // Water turns the flame to steam; foam and carbon dioxide smother it to smoke.
    w.setCell(i, def.id === M.Water || def.id === M.SaltWater ? M.Steam : M.Smoke);
    return true;
  }
  w.igniteNeighbours(x, y);
  return false;
}

/** How many of the 8 neighbours of (x, y) are material a or b. */
function countAround(w: World, x: number, y: number, a: MaterialId, b: MaterialId): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const t = w.get(x + dx, y + dy);
      if (t === a || t === b) n++;
    }
  }
  return n;
}

/**
 * Steam: near the top of the grid, crowded steam gathers into clouds, and the rest condenses back
 * into water (some freezing to ice). It also condenses under a solid ceiling.
 */
export function updateSteam(w: World, x: number, y: number, i: number): boolean {
  const nearTop = y < w.height * 0.1;
  // Plenty of steam crowded together up high gathers into a cloud.
  if (nearTop && w.rng.chance(0.02) && countAround(w, x, y, M.Steam, M.Cloud) >= 4) {
    w.setCell(i, M.Cloud);
    return true;
  }
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
    // Weeds that reach the surface spread across it as algae.
    w.set(nx, ny, w.get(nx, ny - 1) === M.Empty ? M.Algae : M.Grass);
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
/** Added to a growing tip's `life` (its height left) to mark a tree rooted in loam, which flowers. */
const LOAM_TREE = 1000;
/** Added instead to mark the growing tip of a cactus. */
const CACTUS_TIP = 2000;
/** ...or of a bamboo stalk. */
const BAMBOO_TIP = 3000;
/** Ground with no water this near counts as desert. */
const DRY_RANGE = 10;

export function updateSeed(w: World, x: number, y: number, i: number): boolean {
  const height = w.life[i];
  if (height >= BAMBOO_TIP) return growBamboo(w, x, y, i, height - BAMBOO_TIP);
  if (height >= CACTUS_TIP) return growCactus(w, x, y, i, height - CACTUS_TIP);
  if (height > 0) return growTree(w, x, y, i, height);
  if (!w.rng.chance(0.02)) return false;
  if (w.get(x, y - 1) !== M.Empty) return false;
  const below = w.get(x, y + 1);
  if (below === M.Loam) {
    // Right beside water, loam grows bamboo; otherwise a flowering tree.
    w.life[i] = w.near(x, y, 2, M.Water) ? BAMBOO_TIP + w.rng.int(20, 40) : w.rng.int(28, 46) + LOAM_TREE;
    return true;
  }
  if ((below === M.Sand || below === M.Earth || below === M.Grass) && w.near(x, y, DAMP_RANGE, M.Water)) {
    w.life[i] = w.rng.int(18, 34);
    return true;
  }
  // In the desert (sand with no water anywhere near), now and then a seed grows into a cactus.
  if (below === M.Sand && w.rng.chance(0.05) && !w.near(x, y, DRY_RANGE, M.Water)) {
    w.life[i] = CACTUS_TIP + w.rng.int(6, 14);
    return true;
  }
  return false;
}

/** Bamboo shoots straight up, fast, and tops out with a few leaves. */
function growBamboo(w: World, x: number, y: number, i: number, height: number): boolean {
  if (!w.rng.chance(0.5)) return true;
  w.setCell(i, M.Bamboo);
  if (height > 1 && w.get(x, y - 1) === M.Empty) {
    w.set(x, y - 1, M.Seed);
    if (w.inBounds(x, y - 1)) w.life[w.idx(x, y - 1)] = BAMBOO_TIP + height - 1;
  } else {
    growCrown(w, x, y - 1, 2, false);
  }
  return true;
}

/** A cactus climbs a cell at a time, now and then putting out an arm that turns upward. */
function growCactus(w: World, x: number, y: number, i: number, height: number): boolean {
  if (!w.rng.chance(0.15)) return true;
  w.setCell(i, M.Cactus);
  if (height > 1 && w.get(x, y - 1) === M.Empty) {
    w.set(x, y - 1, M.Seed);
    if (w.inBounds(x, y - 1)) w.life[w.idx(x, y - 1)] = CACTUS_TIP + height - 1;
    if (height > 3 && height < 10 && w.rng.chance(0.25)) {
      const dir = w.rng.sign();
      const cells: [number, number][] = [
        [x + dir, y],
        [x + 2 * dir, y],
        [x + 2 * dir, y - 1],
        [x + 2 * dir, y - 2],
      ];
      for (const [cx, cy] of cells) {
        if (w.get(cx, cy) !== M.Empty) break;
        w.set(cx, cy, M.Cactus);
      }
    }
  }
  return true;
}

function growTree(w: World, x: number, y: number, i: number, tip: number): boolean {
  if (!w.rng.chance(0.2)) return true; // grows slowly, and stays put while it does
  const loam = tip >= LOAM_TREE;
  const height = loam ? tip - LOAM_TREE : tip;
  const nx = w.rng.chance(0.15) ? x + w.rng.sign() : x; // a slight lean now and then
  const above = w.get(nx, y - 1);
  w.setCell(i, M.Wood);
  if (height > 1 && (above === M.Empty || above === M.Leaf)) {
    w.set(nx, y - 1, M.Seed);
    if (w.inBounds(nx, y - 1)) w.life[w.idx(nx, y - 1)] = height - 1 + (loam ? LOAM_TREE : 0);
    if (height > 5 && height < 30 && w.rng.chance(0.25)) growBranch(w, x, y, w.rng.sign(), loam);
  } else {
    growCrown(w, x, y - 1, w.rng.int(5, 7), loam);
  }
  return true;
}

function growBranch(w: World, x: number, y: number, dir: number, loam: boolean): void {
  let bx = x;
  let by = y;
  const length = w.rng.int(3, 6);
  for (let k = 0; k < length; k++) {
    bx += dir;
    if (k % 2 === 1) by--;
    if (w.get(bx, by) !== M.Empty) return;
    w.set(bx, by, M.Wood);
  }
  growCrown(w, bx, by - 1, w.rng.int(2, 4), loam);
}

/** A disc of leaves; trees rooted in loam put out the odd flower among them. */
function growCrown(w: World, cx: number, cy: number, r: number, loam: boolean): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      if (w.get(cx + dx, cy + dy) !== M.Empty || !w.rng.chance(0.85)) continue;
      w.set(cx + dx, cy + dy, loam && w.rng.chance(0.08) ? M.Flower : M.Leaf);
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

/** True if none of the 4 neighbours of (x, y) is open air. */
function enclosed(w: World, x: number, y: number): boolean {
  return (
    w.get(x - 1, y) !== M.Empty && w.get(x + 1, y) !== M.Empty && w.get(x, y - 1) !== M.Empty && w.get(x, y + 1) !== M.Empty
  );
}

/** Charcoal: mixes into gunpowder (see above); buried and baked (shut in, over 200°) it slowly turns to coal. */
export function updateCharcoal(w: World, x: number, y: number, i: number): boolean {
  if (formGunpowder(w, x, y, i)) return true;
  if (w.burn[i] === 0 && w.temp[i] > 200 && w.rng.chance(0.002) && enclosed(w, x, y)) {
    w.transform(i, M.Coal);
    return true;
  }
  return false;
}

/** Ash: with sand and water close by, now and then the three turn into wet cement. */
export function formCement(w: World, x: number, y: number, i: number): boolean {
  return mixThree(w, x, y, i, M.Sand, M.Water, M.Cement);
}

/** Put material m into the first open cell below, beside or above (x, y), in that order. */
function drip(w: World, x: number, y: number, m: MaterialId): void {
  const d = w.rng.sign();
  for (const [dx, dy] of DRIP_ORDER) {
    if (w.get(x + dx * d, y + dy) === M.Empty) {
      w.set(x + dx * d, y + dy, m);
      return;
    }
  }
}
const DRIP_ORDER: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 1],
  [-1, 1],
  [1, 0],
  [-1, 0],
  [1, -1],
  [-1, -1],
  [0, -1],
];

/** True if any of the 4 neighbours of (x, y) is material m. */
function touches(w: World, x: number, y: number, m: MaterialId): boolean {
  return w.get(x - 1, y) === m || w.get(x + 1, y) === m || w.get(x, y - 1) === m || w.get(x, y + 1) === m;
}

function isSoil(t: number): boolean {
  return t === M.Earth || t === M.Sand || t === M.Loam || t === M.Mud || t === M.Clay;
}

/** Buried in the ground: no open air or leaves around it, and soil on at least one side. */
function buriedInSoil(w: World, x: number, y: number): boolean {
  let soil = false;
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    const def = w.defAt(nx, ny);
    if (def.kind === 'empty' || def.kind === 'gas' || def.id === M.Leaf) return false;
    if (isSoil(def.id)) soil = true;
  }
  return soil;
}

/**
 * Wood: tapped with iron, it oozes sap; buried under sand it slowly fossilises into oil (see
 * fossilise); buried in damp ground, it now and then grows a mushroom. (Wood in the open, like a
 * tree, never does.)
 */
export function rotWood(w: World, x: number, y: number, i: number): boolean {
  // Tapped with metal (iron touching it), wood now and then oozes a drop of sap.
  if (w.rng.chance(0.01) && w.burn[i] === 0 && touches(w, x, y, M.Iron)) drip(w, x, y, M.Sap);
  if (w.rng.chance(0.0005) && w.burn[i] === 0 && buriedInSoil(w, x, y) && w.near(x, y, DAMP_RANGE, M.Water)) {
    w.transform(i, M.Mushroom);
    return true;
  }
  return fossilise(w, x, y, i);
}

/** Mushroom: in the damp, now and then spreads into a neighbouring wood or leaf cell, eating it. */
export function spreadMushroom(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.005)) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  const t = w.get(nx, ny);
  if ((t === M.Wood || t === M.Leaf) && w.near(nx, ny, DAMP_RANGE, M.Water)) w.set(nx, ny, M.Mushroom);
  return true;
}

/** Flower: now and then drops a seed or a drop of honeydew into the open air below it, or ripens into fruit. */
export function dropSeeds(w: World, x: number, y: number, i: number): boolean {
  if (w.rng.chance(0.0002) && w.get(x, y + 1) === M.Empty) w.set(x, y + 1, M.Seed);
  if (w.rng.chance(0.0003) && w.get(x, y + 1) === M.Empty) w.set(x, y + 1, M.Honeydew);
  // Flowers draw the odd bee.
  if (w.rng.chance(0.0001)) emit(w, x, y, M.Bee);
  // Now and then a flower ripens into fruit, which falls.
  if (w.rng.chance(0.0003)) {
    w.transform(i, M.Fruit);
    return true;
  }
  return true;
}

/**
 * Thermite: while it burns, it melts what it touches into lava, even stone (the one thing that
 * can), and metal into molten iron. Obsidian holds.
 */
export function meltThrough(w: World, x: number, y: number, _i: number): boolean {
  if (w.burn[w.idx(x, y)] === 0 || !w.rng.chance(0.15)) return false;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  const t = w.get(nx, ny);
  if (!w.inBounds(nx, ny)) return false;
  if (t === M.Iron || t === M.Steel || t === M.IronFilings) w.setCell(w.idx(nx, ny), M.MoltenIron);
  else if (isMeltable(t)) w.transform(w.idx(nx, ny), M.Lava);
  return false;
}

function isMeltable(t: number): boolean {
  // Glass isn't here: thermite's heat melts it into molten glass instead (see Glass's `above`).
  return t === M.Stone || t === M.IronOre || t === M.Brick || t === M.Sand;
}

/**
 * Fireworks: once lit, it shoots upwards trailing smoke; just before its fuse runs out it bursts
 * into a ring of flying sparks.
 */
export function launchFirework(w: World, x: number, y: number, i: number): boolean {
  const fuse = w.burn[i];
  if (fuse === 0) return false;
  if (fuse === 1) {
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + w.rng.next() * 0.3;
      const sx = x + Math.round(Math.cos(a) * 2);
      const sy = y + Math.round(Math.sin(a) * 2);
      if (w.get(sx, sy) !== M.Empty) continue;
      w.set(sx, sy, M.Spark);
      const speed = 1.5 + w.rng.next() * 2;
      w.launch(w.idx(sx, sy), Math.cos(a) * speed, Math.sin(a) * speed - 0.5);
    }
    w.setCell(i, M.Smoke);
    return true;
  }
  if (w.vx[i] === 0 && w.vy[i] === 0 && fuse > 6) w.launch(i, (w.rng.next() - 0.5) * 0.8, -5.5 - w.rng.next() * 1.5);
  if (w.rng.chance(0.3) && w.get(x, y + 1) === M.Empty) w.set(x, y + 1, M.Smoke);
  return false;
}

/** Spark: flies; once it has landed it may set what it touches alight, and soon goes out. */
export function igniteOnLanding(w: World, x: number, y: number, i: number): boolean {
  if (w.vx[i] !== 0 || w.vy[i] !== 0) return false;
  if (w.rng.chance(0.2)) w.igniteNeighbours(x, y);
  if (w.rng.chance(0.15)) {
    w.setCell(i, M.Empty);
    return true;
  }
  return false;
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
 * (or, now and then, sulfur or iron ore); salt water leaves salt and copper ore; mud gives tin;
 * ice sets it to obsidian; and in open air its surface slowly crusts into basalt.
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
        // Mostly stone; now and then a yellow sulfur deposit (cool, so it doesn't catch at once),
        // and rarely a lump of iron ore.
        const r = w.rng.next();
        if (r < 0.15) w.setCell(i, M.Sulfur);
        else if (r < 0.25) w.transform(i, M.IronOre);
        else w.transform(i, M.Stone);
        return true;
      }
    } else if (n === M.SaltWater) {
      // Like water, but the sea leaves salt behind, and now and then copper ore.
      if (w.rng.chance(0.5)) w.transform(w.idx(nx, ny), M.Steam);
      if (w.rng.chance(0.2)) {
        const r = w.rng.next();
        if (r < 0.15) w.transform(i, M.CopperOre);
        else if (r < 0.3) w.setCell(i, M.Salt);
        else w.transform(i, M.Stone);
        return true;
      }
    } else if (n === M.CarbonDioxide) {
      // Gas bubbling through it froths the lava into pumice.
      w.setCell(w.idx(nx, ny), M.Empty);
      if (w.rng.chance(0.3)) {
        w.transform(i, M.Pumice);
        return true;
      }
    } else if (n === M.Mud) {
      // Baking mud dries it back to earth; now and then the lava sets around a lump of tin.
      w.transform(w.idx(nx, ny), M.Earth);
      if (w.rng.chance(0.1)) {
        w.transform(i, w.rng.chance(0.3) ? M.Tin : M.Stone);
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
  // Open to the air, the surface slowly crusts over into basalt.
  if (w.get(x, y - 1) === M.Empty && w.rng.chance(0.0005)) {
    w.transform(i, M.Basalt);
    return true;
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

/**
 * The top of the cloud layer at column x: above it is the upper atmosphere, where red sprites
 * appear. It rolls gently along the sky and slowly drifts over time, so cloud tops billow into
 * domes and dips instead of pressing flat against one row. Three waves with unrelated lengths,
 * drifting at different speeds and in both directions, keep the domes from looking evenly spaced:
 * a long swell raises whole stretches, the middle wave makes the domes, a short one lumps them.
 */
function cloudCeiling(w: World, x: number): number {
  const base = w.height * 0.22;
  const swell = w.height * 0.03;
  const t = w.frame;
  return Math.round(
    base +
      swell *
        (0.7 * Math.sin(x * 0.043 + t * 0.0011) +
          Math.sin(x * 0.11 - t * 0.002) +
          0.45 * Math.sin(x * 0.29 + t * 0.0037)),
  );
}

/**
 * Cloud: hangs below the upper atmosphere; now and then drops rain below it; near ice it snows
 * instead, and sometimes hails; thick clouds strike lightning (and sometimes red sprites).
 */
/**
 * Chance per frame, per CLOUD_DEPTH_STEP rows of cloud beyond CLOUD_THIN, that a cloud's base turns
 * to rain. Clouds up to CLOUD_THIN rows thick only drizzle; deeper ones pour until they're about that.
 */
const CLOUD_POUR = 0.008;
/** Chance per frame that a cell on a cloud's base turns to rain, however thin the cloud. */
const CLOUD_DRIZZLE = 0.006;
const CLOUD_THIN = 8;
const CLOUD_DEPTH_STEP = 4;

/** Roughly how much thicker than CLOUD_THIN the cloud above (x, y) is, in steps (0 to 5). */
function cloudDepth(w: World, x: number, y: number): number {
  let n = 0;
  while (n < 5 && w.get(x, y - CLOUD_THIN - n * CLOUD_DEPTH_STEP) === M.Cloud) n++;
  return n;
}

/** Cells a second a cloud travels in a strong wind, divided by 60: whole clouds sail at this pace. */
const CLOUD_DRIFT = 0.18;

/**
 * Wind carries a cloud along as a body: the upwind edge of each row hops through the cloud to the
 * row's leading edge (at most a row away; only edge cells look, now and then, so it stays cheap),
 * so the cloud keeps its shape instead of smearing out. Blown against a mountain (anything solid)
 * or the edge of the world, a cloud breaks up there, partly raining out: the peak pierces it,
 * and its windward side gets the rain.
 */
function cloudDrift(w: World, x: number, y: number, i: number): boolean {
  const d = w.wind > 0 ? 1 : -1;
  if (w.isSolid(x + d, y)) {
    // As fast as the wind brings cloud in, so it doesn't pile up against the slope.
    if (w.rng.chance(0.5)) w.transform(i, M.Water);
    else w.setCell(i, M.Empty);
    return true;
  }
  // Only a cell on the true upwind edge moves (no cloud just behind it), so each row advances one
  // cell per move however many little holes it has.
  for (let k = 1; k <= 3; k++) if (w.get(x - d * k, y) === M.Cloud) return false;
  // It goes to the row's leading edge: the first gap with open air beyond it (or, if something
  // solid is in the way, the last hole before that). Raindrops inside the cloud don't stop it.
  let hole = 0;
  for (let k = 1, end = d > 0 ? w.width - x : x + 1; k < end; k++) {
    const t = w.get(x + d * k, y);
    if (t === M.Empty) {
      hole = k;
      if (w.get(x + d * (k + 1), y) !== M.Cloud && w.get(x + d * (k + 2), y) !== M.Cloud && w.get(x + d * (k + 3), y) !== M.Cloud) break;
    } else if (t !== M.Cloud && w.isSolid(x + d * k, y)) break;
  }
  if (hole === 0) return false;
  w.swap(i, w.idx(x + d * hole, y));
  return true;
}

/**
 * Water vapour (from water evaporating in the sun) rises to the cloud layer and condenses into
 * cloud there, sooner beside cloud that's already there, so clouds grow where vapour gathers.
 */
export function updateVapour(w: World, x: number, y: number, i: number): boolean {
  if (y <= cloudCeiling(w, x) + 3 && w.rng.chance(countAround(w, x, y, M.Cloud, M.Cloud) > 0 ? 0.08 : 0.01)) {
    w.transform(i, M.Cloud);
    return true;
  }
  return false;
}

export function rainCloud(w: World, x: number, y: number, i: number): boolean {
  // Deep inside a thick cloud, very rarely, lightning strikes.
  if (w.rng.chance(0.00002) && countAround(w, x, y, M.Cloud, M.Cloud) >= 6) strike(w, x, y);
  // The base of the cloud drizzles, and under a thick cloud it pours. The rain is the cloud itself
  // coming down (no water from nowhere), so a deep bank rains itself thinner from the bottom up.
  if (w.get(x, y + 1) === M.Empty && w.rng.chance(CLOUD_DRIZZLE + CLOUD_POUR * cloudDepth(w, x, y))) {
    w.setCell(i, M.Empty);
    rainFrom(w, x, y - 1);
    return true;
  }
  if (w.wind !== 0 && w.rng.chance(Math.abs(w.wind) * CLOUD_DRIFT) && cloudDrift(w, x, y, i)) return true;
  // Clouds don't climb into the upper atmosphere (the top of the screen): they hang below it,
  // drifting, and sink back down if they find themselves up there.
  const ceiling = cloudCeiling(w, x);
  if (y < ceiling) {
    if (w.get(x, y + 1) === M.Empty && w.rng.chance(0.3)) w.swap(i, w.idx(x, y + 1));
    else if (w.rng.chance(0.3)) {
      const nx = x + w.rng.sign();
      if (w.get(nx, y) === M.Empty) w.swap(i, w.idx(nx, y));
    }
    return true;
  }
  // Right at the top, now and then a wisp puffs up a little (and sinks back later): a ragged edge.
  if (y <= ceiling + 1 && w.rng.chance(0.02) && w.get(x, y - 1) === M.Empty) {
    w.swap(i, w.idx(x, y - 1));
    return true;
  }
  return false;
}

/** One drop from a cloud: rain, acid rain in sulfur dioxide, or near ice snow and sometimes hail. */
function rainFrom(w: World, x: number, y: number): void {
  if (!w.near(x, y, 6, M.Ice)) {
    // Acid rain where the air is full of sulfur dioxide.
    w.set(x, y + 1, w.near(x, y, 6, M.SulfurDioxide) ? M.Acid : M.Water);
  } else if (w.rng.chance(0.15)) {
    w.set(x, y + 1, M.Hail);
    w.launch(w.idx(x, y + 1), 0, 3); // hail comes down hard
  } else {
    w.set(x, y + 1, M.Snow);
  }
}

/** Put material m into a random open neighbour of (x, y), if there is one there. */
function emit(w: World, x: number, y: number, m: MaterialId): void {
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  if (w.get(nx, ny) === M.Empty) w.set(nx, ny, m);
}

/** Dry ice: slowly gives off carbon dioxide, and now and then a whole cell of it goes. */
export function sublimate(w: World, x: number, y: number, i: number): boolean {
  if (w.rng.chance(0.003)) emit(w, x, y, M.CarbonDioxide);
  if (w.rng.chance(0.0005)) w.transform(i, M.CarbonDioxide);
  return true;
}

/** Fizz: bubbles off carbon dioxide as it flows. */
export function releaseGas(w: World, x: number, y: number, _i: number): boolean {
  if (w.rng.chance(0.03)) emit(w, x, y, M.CarbonDioxide);
  return false;
}

/** Seaweed: now and then grows up into the salt water above it, swaying a little. */
export function growSeaweed(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.01)) return true;
  const nx = w.rng.chance(0.3) ? x + w.rng.sign() : x;
  if (w.get(nx, y - 1) === M.SaltWater) w.set(nx, y - 1, M.Seaweed);
  return true;
}

function isClimbable(t: number): boolean {
  return t === M.Wood || t === M.Stone || t === M.Brick;
}

/** Vine: now and then climbs into an open cell above or beside it that sits against wood, stone or brick. */
export function climbVine(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.02)) return true;
  const sideways = w.rng.chance(0.3);
  // Mostly straight up, sometimes up and across.
  const nx = x + (sideways ? w.rng.sign() : w.rng.chance(0.7) ? 0 : w.rng.sign());
  const ny = sideways ? y : y - 1;
  if (w.get(nx, ny) !== M.Empty) return true;
  if (
    isClimbable(w.get(nx - 1, ny)) ||
    isClimbable(w.get(nx + 1, ny)) ||
    isClimbable(w.get(nx, ny - 1)) ||
    isClimbable(w.get(nx, ny + 1))
  ) {
    w.set(nx, ny, M.Vine);
  }
  return true;
}

function isMasonry(t: number): boolean {
  return t === M.Stone || t === M.Brick;
}

/** Moss: now and then creeps into an open cell that sits against stone or brick, if it's damp. */
export function growMoss(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.01)) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  if (w.get(nx, ny) !== M.Empty) return true;
  if (!(isMasonry(w.get(nx - 1, ny)) || isMasonry(w.get(nx + 1, ny)) || isMasonry(w.get(nx, ny - 1)) || isMasonry(w.get(nx, ny + 1)))) {
    return true;
  }
  if (w.near(nx, ny, DAMP_RANGE, M.Water)) w.set(nx, ny, M.Moss);
  return true;
}

/** Algae: floats; now and then spreads into a neighbouring water cell at the surface. */
export function spreadAlgae(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.01)) return false;
  const nx = x + w.rng.sign();
  const ny = y + w.rng.int(0, 1);
  if (w.get(nx, ny) === M.Water && w.get(nx, ny - 1) === M.Empty) w.set(nx, ny, M.Algae);
  return false;
}

/**
 * A lightning strike from (x, y): a jagged bolt down through air and gas until it hits something,
 * which it electrifies if it conducts, or else sets alight. Now and then the same discharge throws
 * red sprites up into the clear sky above the cloud.
 */
function strike(w: World, x: number, y: number): void {
  if (w.rng.chance(0.35)) spawnSprites(w, x, y);
  let bx = x;
  for (let by = y + 1; by < w.height; by++) {
    bx += w.rng.int(-1, 1);
    const def = w.defAt(bx, by);
    if (def.id === M.Cloud) continue;
    if (def.kind === 'empty' || def.kind === 'gas') {
      w.set(bx, by, M.Lightning);
      continue;
    }
    if (w.inBounds(bx, by)) {
      const n = w.idx(bx, by);
      if (!w.electrify(n)) w.ignite(n);
    }
    return;
  }
}

/** Lightning: for its few frames, sparks any conductor it touches, turns hydrogen to plasma, and sets flammable neighbours alight. */
export function updateBolt(w: World, x: number, y: number, _i: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (!w.inBounds(nx, ny)) continue;
    const n = w.idx(nx, ny);
    const t = w.get(nx, ny);
    // Lightning through hydrogen strips it into plasma, and now and then magnetises iron.
    if (t === M.Hydrogen) w.transform(n, M.Plasma);
    else if (t === M.Iron && w.rng.chance(0.05)) w.transform(n, M.Magnet);
    // An arc through charcoal or coal turns it to graphite.
    else if ((t === M.Charcoal || t === M.Coal) && w.rng.chance(0.2)) w.transform(n, M.Graphite);
    // An arc through quartz against carbon makes silicon, as in a real arc furnace: a solar cell.
    else if (t === M.Quartz && w.rng.chance(0.2) && countAround(w, nx, ny, M.Graphite, M.Graphite) > 0) {
      w.transform(n, M.SolarCell);
    }
    else w.electrify(n);
  }
  w.igniteNeighbours(x, y);
  return true;
}

/** Battery: now and then sends a pulse into every conductor touching it. */
export function pulseBattery(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.02)) return true;
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (w.inBounds(nx, ny)) w.electrify(w.idx(nx, ny));
  }
  return true;
}

/** Solar cell: while sunlight reaches it, pulses touching conductors (as often as a battery in full sun). */
export function solarCell(w: World, x: number, y: number, _i: number): boolean {
  if (w.sun <= 0 || !w.rng.chance(0.02 * w.sun) || !w.inSunlight(x, y)) return true;
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (w.inBounds(nx, ny)) w.electrify(w.idx(nx, ny));
  }
  return true;
}

/** Salt water: with iron and charcoal close by, now and then the three make a battery (a wet cell). */
export function formBattery(w: World, x: number, y: number, i: number): boolean {
  return mixThree(w, x, y, i, M.Iron, M.Charcoal, M.Battery);
}

/** Sugar: with water and mushroom (yeast) close by, now and then the three ferment into alcohol. */
export function formAlcohol(w: World, x: number, y: number, i: number): boolean {
  return mixThree(w, x, y, i, M.Water, M.Mushroom, M.Alcohol);
}

/** Magnet: now and then reaches to a random cell nearby and, if it's iron filings or rust, pulls it a step closer. */
export function pullIron(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.3)) return true;
  const tx = x + w.rng.int(-MAGNET_REACH, MAGNET_REACH);
  const ty = y + w.rng.int(-MAGNET_REACH, MAGNET_REACH);
  const t = w.get(tx, ty);
  if (t !== M.IronFilings && t !== M.Rust) return true;
  const sx = tx + Math.sign(x - tx);
  const sy = ty + Math.sign(y - ty);
  if (w.get(sx, sy) === M.Empty) w.swap(w.idx(tx, ty), w.idx(sx, sy));
  return true;
}
const MAGNET_REACH = 8;

/** Molten glass: caught by the wind at its surface, it now and then spins out into glass fibre. */
export function spinFibre(w: World, x: number, y: number, i: number): boolean {
  if (w.wind === 0 || w.get(x, y - 1) !== M.Empty || !w.rng.chance(Math.abs(w.wind) * 0.02)) return false;
  w.transform(i, M.GlassFibre);
  return true;
}

/** Geyser rock: when hot, now and then blasts a column of water and steam up out of the open cells above it. */
export function erupt(w: World, x: number, y: number, i: number): boolean {
  if (w.temp[i] < 150 || !w.rng.chance(0.004)) return true;
  for (let k = 1; k <= 6; k++) {
    if (w.get(x, y - k) !== M.Empty) break;
    w.set(x, y - k, k % 3 === 0 ? M.Steam : M.Water);
    if (k % 3 !== 0) w.launch(w.idx(x, y - k), (w.rng.next() - 0.5) * 0.6, -4 - w.rng.next() * 2);
  }
  return true;
}

/** Sand: buried deep and hot (450-640°, below melting into glass) it slowly crystallises into quartz; otherwise see sproutGrass. */
export function updateSand(w: World, x: number, y: number, i: number): boolean {
  const t = w.temp[i];
  if (t > 450 && w.rng.chance(0.003) && enclosed(w, x, y)) {
    w.transform(i, M.Quartz);
    return true;
  }
  return sproutGrass(w, x, y, i);
}

/** Clay: fired gently (120-250°; any hotter and it becomes brick), it slowly turns to terracotta. */
export function fireClay(w: World, _x: number, _y: number, i: number): boolean {
  const t = w.temp[i];
  if (t > 120 && w.rng.chance(0.003)) {
    w.transform(i, M.Terracotta);
    return true;
  }
  return false;
}

/** Terracotta: water sitting on it now and then seeps through to the open cell below. */
export function seepThrough(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.01) || w.get(x, y - 1) !== M.Water || w.get(x, y + 1) !== M.Empty) return true;
  w.setCell(w.idx(x, y - 1), M.Empty);
  w.set(x, y + 1, M.Water);
  return true;
}

/** Foam: caught by the wind at its surface, it now and then blows off as a soap bubble. */
export function blowBubbles(w: World, x: number, y: number, i: number): boolean {
  if (w.wind === 0 || w.get(x, y - 1) !== M.Empty || !w.rng.chance(Math.abs(w.wind) * 0.01)) return false;
  w.transform(i, M.Bubble);
  return true;
}

/** Quicklime: touching water, it turns to slaked lime and gets fiercely hot (often boiling the water). */
export function slake(w: World, x: number, y: number, i: number): boolean {
  if (!touches(w, x, y, M.Water) || !w.rng.chance(0.05)) return false;
  w.setCell(i, M.SlakedLime);
  w.temp[i] = 400;
  return true;
}

/** Smoke bomb: while it burns, pours smoke into the cells around it. */
export function billowSmoke(w: World, x: number, y: number, i: number): boolean {
  if (w.burn[i] > 0 && w.rng.chance(0.8)) emit(w, x, y, M.Smoke);
  return false;
}

/**
 * Red sprites: when a storm discharges, eerie red jellyfish of light can flash in the clear sky far
 * above the cloud: a bright red head, long tendrils hanging towards the cloud that fade to violet,
 * a few faint streamers reaching up, and sometimes a dim ring above. They come in ones, twos or
 * threes, flicker, and are gone in a fraction of a second. Only where there is enough open sky.
 */
function spawnSprites(w: World, x: number, y: number): void {
  let top = y;
  while (w.get(x, top - 1) === M.Cloud) top--;
  let sky = 0;
  while (sky < top && w.get(x, top - 1 - sky) === M.Empty) sky++;
  if (sky < 14) return;
  const count = w.rng.chance(0.5) ? 1 : w.rng.int(2, 3);
  for (let k = 0; k < count; k++) {
    const cx = x + (k === 0 ? 0 : w.rng.sign() * w.rng.int(7, 14));
    spawnSprite(w, cx, top - 1, sky);
  }
}

function spawnSprite(w: World, cx: number, base: number, sky: number): void {
  const life = w.rng.int(16, 26);
  const headY = base - Math.round(sky * w.rng.next() * 0.15 + sky * 0.6);
  const r = w.rng.int(2, 3);
  const glow = (x: number, y: number, shade: number, frames: number): void => {
    if (w.get(x, y) !== M.Empty) return;
    w.set(x, y, M.Sprite);
    const i = w.idx(x, y);
    w.shade[i] = shade;
    w.life[i] = frames;
  };
  // Head: a squat red dome.
  for (let dy = -r; dy <= 1; dy++) {
    for (let dx = -r * 2; dx <= r * 2; dx++) {
      if ((dx * dx) / (r * r * 4) + (dy * dy) / (r * r) <= 1) glow(cx + dx, headY + dy, w.rng.int(0, 2), life);
    }
  }
  // Tendrils: hanging down towards the cloud, wavering, red turning violet as they go.
  const strands = w.rng.int(6, 10);
  const reach = base - headY - 1;
  for (let s = 0; s < strands; s++) {
    let tx = cx + w.rng.int(-r * 2, r * 2);
    const length = Math.round(reach * (0.5 + w.rng.next() * 0.5));
    for (let d = 2; d <= length; d++) {
      if (w.rng.chance(0.25)) tx += w.rng.sign();
      // A tendril ends where it meets a billow of cloud (tops are uneven); it never hangs into one.
      if (w.get(tx, headY + d) !== M.Empty) break;
      glow(tx, headY + d, Math.min(15, 3 + Math.round((d / reach) * 12)), life - w.rng.int(0, 4));
    }
  }
  // Streamers: a few faint threads reaching up from the head.
  for (let s = w.rng.int(2, 4); s > 0; s--) {
    let tx = cx + w.rng.int(-r, r);
    for (let d = r + 1; d <= r + w.rng.int(3, 7); d++) {
      if (w.rng.chance(0.3)) tx += w.rng.sign();
      glow(tx, headY - d, w.rng.int(4, 7), life - 6);
    }
  }
  // Now and then a dim ring (an "elve") flickers higher still.
  if (w.rng.chance(0.4)) {
    const ringY = headY - r - 9;
    for (let dx = -r * 5; dx <= r * 5; dx++) if (w.rng.chance(0.7)) glow(cx + dx, ringY, w.rng.int(1, 3), life - 8);
  }
}

// ------------------------------------------------------------------ creatures
// Each creature is one cell. It moves by swapping into a neighbouring cell of its habitat, keeps a
// food count in `life` (when it has no lifetime of its own), breeds slowly once fed, and dies into
// something. See Conventions in CLAUDE.md.

/** Direction k (0-3: left, right, up, down) applied to x and to y. No allocation, for per-cell use. */
function dirX(k: number, x: number): number {
  return k === 0 ? x - 1 : k === 1 ? x + 1 : x;
}
function dirY(k: number, y: number): number {
  return k === 2 ? y - 1 : k === 3 ? y + 1 : y;
}

/** Index of a 4-neighbour of (x, y) holding a or b, or -1. */
function neighbourOf(w: World, x: number, y: number, a: MaterialId, b: MaterialId): number {
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    const t = w.get(nx, ny);
    if ((t === a || t === b) && w.inBounds(nx, ny)) return w.idx(nx, ny);
  }
  return -1;
}

/** Move creature i into a random 4-neighbour holding a or b. Returns its new index, or -1. */
function crawl(w: World, x: number, y: number, i: number, a: MaterialId, b: MaterialId): number {
  const k = w.rng.int(0, 3);
  const nx = dirX(k, x);
  const ny = dirY(k, y);
  const t = w.get(nx, ny);
  if ((t !== a && t !== b) || !w.inBounds(nx, ny)) return -1;
  const n = w.idx(nx, ny);
  w.swap(i, n);
  return n;
}

/** Breed: turn a neighbouring cell of `into` (or `orInto`) next to cell n into another `kind`. */
function breed(w: World, n: number, kind: MaterialId, into: MaterialId, orInto: MaterialId): void {
  const x = n % w.width;
  const y = (n - x) / w.width;
  const m = neighbourOf(w, x, y, into, orInto);
  if (m >= 0) w.setCell(m, kind);
}

/** Earthworm: burrows through earth and loam, leaving loam behind; breeds when fed; drowns in water. */
export function updateWorm(w: World, x: number, y: number, i: number): boolean {
  if ((w.rng.chance(0.00005) || (touches(w, x, y, M.Water) && w.rng.chance(0.01)))) {
    w.transform(i, M.Earth);
    return true;
  }
  if (neighbourOf(w, x, y, M.Earth, M.Loam) < 0) return false; // in the open: it falls
  if (!w.rng.chance(0.3)) return true;
  const n = crawl(w, x, y, i, M.Earth, M.Loam);
  if (n >= 0 && w.mat[i] === M.Earth && w.rng.chance(0.1)) {
    w.transform(i, M.Loam);
    if (++w.life[n] >= 6 && w.rng.chance(0.2)) {
      w.life[n] = 0;
      breed(w, n, M.Earthworm, M.Earth, M.Loam);
    }
  }
  return true;
}

/** Termite: eats into neighbouring wood, leaving sawdust; breeds when fed; dies out in the open. */
export function updateTermite(w: World, x: number, y: number, i: number): boolean {
  const wood = neighbourOf(w, x, y, M.Wood, M.Wood);
  if (wood < 0) {
    if (w.rng.chance(0.003)) w.setCell(i, M.Empty);
    return true;
  }
  if (!w.rng.chance(0.03)) return true;
  const food = w.life[i] + 1;
  w.setCell(wood, M.Termite);
  w.life[wood] = food;
  w.setCell(i, M.Sawdust);
  if (food >= 8 && w.rng.chance(0.25)) {
    w.life[wood] = 0;
    breed(w, wood, M.Termite, M.Wood, M.Wood);
  }
  return true;
}

/** Fish: swims through water, eats algae and breeds when fed; out of water it falls and is soon gone. */
export function updateFish(w: World, x: number, y: number, i: number): boolean {
  if (neighbourOf(w, x, y, M.Water, M.SaltWater) < 0) {
    if (w.get(x, y + 1) === M.Empty) w.swap(i, w.idx(x, y + 1));
    else if (w.rng.chance(0.02)) w.setCell(i, M.Empty);
    return true;
  }
  if (w.rng.chance(0.00003)) {
    w.setCell(i, M.Water);
    return true;
  }
  const algae = neighbourOf(w, x, y, M.Algae, M.Algae);
  if (algae >= 0 && w.rng.chance(0.02)) {
    w.setCell(algae, M.Water);
    if (++w.life[i] >= 5 && w.rng.chance(0.3)) {
      w.life[i] = 0;
      breed(w, i, M.Fish, M.Water, M.SaltWater);
    }
  }
  if (w.rng.chance(0.4)) crawl(w, x, y, i, M.Water, M.SaltWater);
  return true;
}

/** Firefly: drifts about in open air; water puts it out. (It glows and flickers via the renderer.) */
export function updateFirefly(w: World, x: number, y: number, i: number): boolean {
  if (touches(w, x, y, M.Water) && w.rng.chance(0.05)) {
    w.setCell(i, M.Empty);
    return true;
  }
  if (w.rng.chance(0.3)) crawl(w, x, y, i, M.Empty, M.Empty);
  return true;
}

/** Bee: buzzes about in open air, turning any honeydew it touches into honey. */
export function updateBee(w: World, x: number, y: number, i: number): boolean {
  const dew = neighbourOf(w, x, y, M.Honeydew, M.Honeydew);
  if (dew >= 0 && w.rng.chance(0.05)) w.setCell(dew, M.Honey);
  if (w.rng.chance(0.5)) crawl(w, x, y, i, M.Empty, M.Empty);
  return true;
}

/** Snail: creeps along solid surfaces, eating algae and moss and breeding when fed; leaves chalk when it dies. */
export function updateSnail(w: World, x: number, y: number, i: number): boolean {
  const food = neighbourOf(w, x, y, M.Algae, M.Moss);
  if (food >= 0 && w.rng.chance(0.01)) {
    w.setCell(food, M.Empty);
    if (++w.life[i] >= 4 && w.rng.chance(0.3)) {
      w.life[i] = 0;
      w.setCell(food, M.Snail);
    }
  }
  const grip = w.isSolid(x - 1, y) || w.isSolid(x + 1, y) || w.isSolid(x, y - 1) || w.isSolid(x, y + 1);
  if (!grip) {
    if (w.get(x, y + 1) === M.Empty) w.swap(i, w.idx(x, y + 1));
    return true;
  }
  if (!w.rng.chance(0.05)) return true;
  const k = w.rng.int(0, 3);
  const nx = dirX(k, x);
  const ny = dirY(k, y);
  if (w.get(nx, ny) !== M.Empty) return true;
  if (w.isSolid(nx - 1, ny) || w.isSolid(nx + 1, ny) || w.isSolid(nx, ny - 1) || w.isSolid(nx, ny + 1)) {
    w.swap(i, w.idx(nx, ny));
  }
  return true;
}
