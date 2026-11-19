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
/** Ground with no water this near counts as desert. */
const DRY_RANGE = 10;

export function updateSeed(w: World, x: number, y: number, i: number): boolean {
  const height = w.life[i];
  if (height >= CACTUS_TIP) return growCactus(w, x, y, i, height - CACTUS_TIP);
  if (height > 0) return growTree(w, x, y, i, height);
  if (!w.rng.chance(0.02)) return false;
  if (w.get(x, y - 1) !== M.Empty) return false;
  const below = w.get(x, y + 1);
  if (below === M.Loam) {
    w.life[i] = w.rng.int(28, 46) + LOAM_TREE;
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
 * Wood: buried under sand it slowly fossilises into oil (see fossilise); buried in damp ground,
 * it now and then grows a mushroom. (Wood in the open, like a tree, never does.)
 */
export function rotWood(w: World, x: number, y: number, i: number): boolean {
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

/** Flower: now and then drops a seed into the open air below it. */
export function dropSeeds(w: World, x: number, y: number, _i: number): boolean {
  if (w.rng.chance(0.0002) && w.get(x, y + 1) === M.Empty) w.set(x, y + 1, M.Seed);
  return true;
}

/**
 * Thermite: while it burns, it melts what it touches into lava, even stone (the one thing that
 * can) and metal. Obsidian holds.
 */
export function meltThrough(w: World, x: number, y: number, _i: number): boolean {
  if (w.burn[w.idx(x, y)] === 0 || !w.rng.chance(0.15)) return false;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  const t = w.get(nx, ny);
  if (w.inBounds(nx, ny) && isMeltable(t)) w.transform(w.idx(nx, ny), M.Lava);
  return false;
}

function isMeltable(t: number): boolean {
  return t === M.Stone || t === M.Iron || t === M.IronOre || t === M.Brick || t === M.Glass || t === M.Sand;
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
 * (or, now and then, sulfur or iron ore); where it meets ice it sets to obsidian.
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
    } else if (n === M.CarbonDioxide) {
      // Gas bubbling through it froths the lava into pumice.
      w.setCell(w.idx(nx, ny), M.Empty);
      if (w.rng.chance(0.3)) {
        w.transform(i, M.Pumice);
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

/** Cloud: now and then drops rain below it; near ice it snows instead, and sometimes hails; thick clouds strike lightning. */
export function rainCloud(w: World, x: number, y: number, _i: number): boolean {
  // Deep inside a thick cloud, very rarely, lightning strikes.
  if (w.rng.chance(0.00002) && countAround(w, x, y, M.Cloud, M.Cloud) >= 6) strike(w, x, y);
  if (!w.rng.chance(0.006) || w.get(x, y + 1) !== M.Empty) return false;
  if (!w.near(x, y, 6, M.Ice)) {
    w.set(x, y + 1, M.Water);
  } else if (w.rng.chance(0.15)) {
    w.set(x, y + 1, M.Hail);
    w.launch(w.idx(x, y + 1), 0, 3); // hail comes down hard
  } else {
    w.set(x, y + 1, M.Snow);
  }
  return false;
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
 * which it electrifies if it conducts, or else sets alight.
 */
function strike(w: World, x: number, y: number): void {
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

/** Lightning: for its few frames, sparks any conductor it touches and sets flammable neighbours alight. */
export function updateBolt(w: World, x: number, y: number, _i: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (w.inBounds(nx, ny)) w.electrify(w.idx(nx, ny));
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

/** Salt water: with iron and charcoal close by, now and then the three make a battery (a wet cell). */
export function formBattery(w: World, x: number, y: number, i: number): boolean {
  return mixThree(w, x, y, i, M.Iron, M.Charcoal, M.Battery);
}
