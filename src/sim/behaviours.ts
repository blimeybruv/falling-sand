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

/** Marks (in `life`) an ice crystal frozen out of the sky, which falls until it lands. */
export const FALLING_ICE = 1;

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
    // Up in the cold, some of it freezes straight to ice, a crystal that falls until it lands (and
    // melts there, unless the ground is frozen).
    if (w.rng.chance(0.08)) {
      w.setCell(i, M.Ice);
      w.life[i] = FALLING_ICE;
    } else {
      w.setCell(i, M.Water);
    }
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

/** With the sun out, a plant in shade grows at this fraction of its old pace (in sun, up to twice). */
const SHADE_GROWTH = 0.35;

/**
 * Whether a plant at (x, y) grows this frame, `base` being its chance with no sun. With the sun
 * out it grows faster in sunlight (up to twice as often in full sun) and slower in shade; with
 * `shadeLoving` (moss) the other way round. The sunlight check only runs once the roll succeeds.
 */
function thrives(w: World, x: number, y: number, base: number, shadeLoving = false): boolean {
  const sun = w.sun;
  // At night (sun below 0) plants just grow at their ordinary rate.
  if (sun <= 0) return w.rng.chance(base);
  if (!w.rng.chance(base * (1 + sun))) return false;
  return w.inSunlight(x, y) !== shadeLoving || w.rng.chance(SHADE_GROWTH / (1 + sun));
}

/** Whether a weed stem grows within WEED_SPACING cells either side of (x, y): stems stand apart, with water between. */
function weedBeside(w: World, x: number, y: number): boolean {
  for (let dx = -WEED_SPACING; dx <= WEED_SPACING; dx++) if (dx !== 0 && w.get(x + dx, y) === M.Grass) return true;
  return false;
}
const WEED_SPACING = 3;

/** Grass: now and then spreads into neighbouring water, or over neighbouring open ground (see below). */
export function growGrass(w: World, x: number, y: number, _i: number): boolean {
  // Fed by fertiliser, saltpetre (nitrate) or ash (potash) beside or beneath it, grass spreads twice as fast.
  if (!thrives(w, x, y, 0.03) && !(thrives(w, x, y, 0.03) && (touches(w, x, y, M.Fertiliser) || touches(w, x, y, M.Saltpetre) || touches(w, x, y, M.Ash)))) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  const t = w.get(nx, ny);
  if (t === M.Water) {
    // Weeds spread across the surface as algae. Under water they only grow straight up, single
    // stems towards the light with water between them (spreading every way, they used to fill a
    // whole pond and wall its fish in; a flooded meadow sent up a solid wall), until they too reach
    // the surface.
    if (w.get(nx, ny - 1) === M.Empty) w.set(nx, ny, M.Algae);
    else if (nx === x && ny === y - 1 && w.rng.chance(0.3) && !weedBeside(w, nx, ny)) w.set(nx, ny, M.Grass);
  } else if ((t === M.Sand || t === M.Earth || t === M.Loam || t === M.Fertiliser) && w.get(nx, ny - 1) === M.Empty) {
    // Creeps over open ground: loam and fertiliser always, sand and earth only where it's damp.
    if (t === M.Loam || t === M.Fertiliser || w.near(nx, ny, DAMP_RANGE, M.Water)) w.set(nx, ny, M.Grass);
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
/** ...a pine (from a pine cone's seed), a palm (on a sandy shore), a willow (beside fresh water), or a rare giant. */
const PINE_TIP = 4000;
const PALM_TIP = 5000;
const WILLOW_TIP = 6000;
export const GIANT_TIP = 7000;
/** A dormant seed's `life` when it came out of a pine cone: it grows into a pine. */
export const PINE_SEED = -1;
/** On rich ground (loam or fertiliser), the chance a broadleaf seed grows into a giant instead. */
const GIANT_CHANCE = 0.005;
/** A seed heated past this pops into popcorn. */
const POP_TEMP = 180;
/** Ground with no water this near counts as desert. */
const DRY_RANGE = 10;

export function updateSeed(w: World, x: number, y: number, i: number): boolean {
  const height = w.life[i];
  if (height >= GIANT_TIP) return growGiant(w, x, y, i, height - GIANT_TIP);
  if (height >= WILLOW_TIP) return growTree(w, x, y, i, height - WILLOW_TIP, 'willow');
  if (height >= PALM_TIP) return growPalm(w, x, y, i, height - PALM_TIP);
  if (height >= PINE_TIP) return growPine(w, x, y, i, height - PINE_TIP);
  if (height >= BAMBOO_TIP) return growBamboo(w, x, y, i, height - BAMBOO_TIP);
  if (height >= CACTUS_TIP) return growCactus(w, x, y, i, height - CACTUS_TIP);
  if (height > 0) return growTree(w, x, y, i, height, 'broadleaf');
  // Heated past 180° (short of catching fire at 220°), a seed pops.
  if (w.temp[i] > POP_TEMP) {
    w.transform(i, M.Popcorn);
    w.launch(i, w.rng.next() * 2 - 1, -2 - w.rng.next() * 1.5);
    w.noise.pops++;
    return true;
  }
  // On ash it sprouts three times as readily, and in smoke too (real seeds answer to chemicals in
  // smoke, karrikins, which tell them a fire has cleared the ground).
  if (!thrives(w, x, y, w.get(x, y + 1) === M.Ash || touches(w, x, y, M.Smoke) ? 0.06 : 0.02)) return false;
  const up = w.get(x, y - 1);
  if (up !== M.Empty && up !== M.Smoke) return false;
  const below = w.get(x, y + 1);
  // A seed from a pine cone grows a pine: pines take to poor, dry ground too, but not crowded in
  // right beside another trunk.
  if (height === PINE_SEED) {
    if (isTreeGround(below) && !nearWood(w, x, y, 3)) sprout(w, i, PINE_TIP, w.rng.int(22, 38));
    return true;
  }
  // On a sandy shore by the sea, a palm.
  if (below === M.Sand && w.near(x, y, 10, M.SaltWater)) {
    sprout(w, i, PALM_TIP, w.rng.int(16, 26));
    return true;
  }
  if (below === M.Loam) {
    // Right beside water, loam grows bamboo; otherwise a flowering tree (rarely, a giant).
    if (w.near(x, y, 2, M.Water)) w.life[i] = BAMBOO_TIP + w.rng.int(20, 40);
    else if (w.rng.chance(GIANT_CHANCE)) sprout(w, i, GIANT_TIP, w.rng.int(70, 100));
    else sprout(w, i, LOAM_TREE, w.rng.int(28, 46));
    return true;
  }
  // Right beside fresh water, a willow leaning over it.
  if ((below === M.Sand || below === M.Earth || below === M.Grass) && w.near(x, y, 5, M.Water)) {
    sprout(w, i, WILLOW_TIP, w.rng.int(12, 20));
    return true;
  }
  // On fertiliser or ash (rich in potash, the ash-bed after a fire), or damp ground, it grows into a tree.
  if (below === M.Fertiliser || below === M.Ash || ((below === M.Sand || below === M.Earth || below === M.Grass) && w.near(x, y, DAMP_RANGE, M.Water))) {
    if (below === M.Fertiliser && w.rng.chance(GIANT_CHANCE)) sprout(w, i, GIANT_TIP, w.rng.int(70, 100));
    else sprout(w, i, 0, w.rng.int(18, 34));
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
  if (!thrives(w, x, y, 0.5)) return true;
  w.setCell(i, M.Bamboo);
  if (height > 1 && w.get(x, y - 1) === M.Empty) {
    w.set(x, y - 1, M.Seed);
    if (w.inBounds(x, y - 1)) w.life[w.idx(x, y - 1)] = BAMBOO_TIP + height - 1;
  } else {
    crown(w, x, y - 1, 2, false, false);
  }
  return true;
}

/** A cactus climbs a cell at a time, now and then putting out an arm that turns upward. */
function growCactus(w: World, x: number, y: number, i: number, height: number): boolean {
  if (!thrives(w, x, y, 0.15)) return true;
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

/** Ground a tree can root in. */
function isTreeGround(t: number): boolean {
  return t === M.Earth || t === M.Grass || t === M.Sand || t === M.Loam || t === M.Ash || t === M.Fertiliser;
}

/** Whether there's a trunk (wood) within r cells either side of (x, y) or just above or below. */
function nearWood(w: World, x: number, y: number, r: number): boolean {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -r; dx <= r; dx++) if (w.get(x + dx, y + dy) === M.Wood) return true;
  return false;
}

/**
 * Turn a seed into the growing tip of a tree: `life` is the species' offset plus the height left
 * to grow, and `vel` keeps the height it started with (a tip never falls, so `vel` is free), which
 * some species need to know where they are along the trunk.
 */
function sprout(w: World, i: number, species: number, height: number): void {
  w.life[i] = species + height;
  w.vel[i] = height;
  const x = i % w.width;
  growRoots(w, x, (i - x) / w.width + 1, Math.min(14, 3 + (height >> 2)));
}

/** Soil roots can grow through. */
function isRootSoil(t: number): boolean {
  return t === M.Earth || t === M.Loam || t === M.Sand || t === M.Grass || t === M.Ash || t === M.Fertiliser || t === M.Mud || t === M.Clay;
}

/**
 * Roots, as a tree sprouts: a few strands working down into the soil below it and spreading
 * outwards a little as they go, deeper for a bigger tree. They stop at anything that isn't soil.
 */
function growRoots(w: World, x: number, y: number, depth: number): void {
  const strands = depth > 8 ? 3 : 2;
  for (let s = 0; s < strands; s++) {
    // One strand heads down, the others out to either side.
    const lean = strands === 3 ? s - 1 : s === 0 ? -1 : 1;
    let rx = x;
    let ry = y;
    for (let k = 0; k < depth; k++) {
      if (!isRootSoil(w.get(rx, ry))) break;
      w.setCell(w.idx(rx, ry), M.Root);
      ry++;
      if (lean !== 0 && w.rng.chance(0.5)) rx += lean;
      else if (w.rng.chance(0.2)) rx += w.rng.sign();
    }
  }
}

/** Move a growing tip up to (nx, ny), carrying its species, height left and starting height. */
function climb(w: World, nx: number, ny: number, species: number, height: number, start: number): void {
  w.set(nx, ny, M.Seed);
  if (!w.inBounds(nx, ny)) return;
  const n = w.idx(nx, ny);
  w.life[n] = species + height;
  w.vel[n] = start;
}

/** Wood into (x, y) if it's open air or leaves: thickening a trunk, or a branch. */
function wood(w: World, x: number, y: number): void {
  const t = w.get(x, y);
  if (t === M.Empty || t === M.Leaf || t === M.Needles) w.set(x, y, M.Wood);
}

/**
 * A broadleaf tree, or (`willow`) a willow. It climbs a cell at a time leaving wood behind, leaning
 * a little now and then; low down on a tall tree the trunk is two cells thick. It puts out forking
 * branches with clusters of leaves at their tips, and finishes with a crown. Rooted in loam it
 * flowers; a willow's crowns hang down in curtains.
 */
function growTree(w: World, x: number, y: number, i: number, tip: number, kind: 'broadleaf' | 'willow'): boolean {
  if (!thrives(w, x, y, 0.2)) return true; // grows slowly, and stays put while it does
  const willow = kind === 'willow';
  // (For a willow, `tip` is already the height left; otherwise it may carry the loam marker.)
  const species = willow ? WILLOW_TIP : tip >= LOAM_TREE ? LOAM_TREE : 0;
  const loam = species === LOAM_TREE;
  const height = willow ? tip : tip - species;
  const start = w.vel[i];
  const nx = w.rng.chance(willow ? 0.3 : 0.15) ? x + w.rng.sign() : x; // a slight lean now and then
  const above = w.get(nx, y - 1);
  w.setCell(i, M.Wood);
  // Low down on a tall tree, a trunk two cells thick.
  if (height > 14) wood(w, x + 1, y);
  if (height > 1 && (above === M.Empty || above === M.Leaf)) {
    climb(w, nx, y - 1, species, height - 1, start);
    if (height > 4 && height < 30 && w.rng.chance(willow ? 0.3 : 0.25)) growBranch(w, x, y, w.rng.sign(), loam, willow, w.rng.int(3, 6));
  } else {
    crown(w, x, y - 1, w.rng.int(5, 7), loam, willow);
  }
  return true;
}

/** A branch reaching out and up from (x, y), forking now and then, with leaves at its tips. */
function growBranch(w: World, x: number, y: number, dir: number, loam: boolean, willow: boolean, length: number): void {
  let bx = x;
  let by = y;
  // Set out from the side of the trunk, however thick it is.
  while (w.get(bx + dir, by) === M.Wood) bx += dir;
  for (let k = 0; k < length; k++) {
    bx += dir;
    if (k % 2 === 1) by--;
    if (w.get(bx, by) !== M.Empty) return;
    w.set(bx, by, M.Wood);
    // Halfway along, sometimes a fork turns up and out on its own.
    if (k === length >> 1 && length >= 4 && w.rng.chance(0.4)) {
      let fx = bx;
      let fy = by;
      for (let f = 0; f < 2 + (length >> 2); f++) {
        fy--;
        if (f % 2 === 1) fx += dir;
        if (w.get(fx, fy) !== M.Empty) break;
        w.set(fx, fy, M.Wood);
      }
      crown(w, fx, fy - 1, 2 + (length >> 3), loam, willow);
    }
  }
  crown(w, bx, by - 1, w.rng.int(2, 3) + (length >> 3), loam, willow);
}

/**
 * A cluster of leaves; trees rooted in loam put out the odd flower among them. A willow's hang
 * down from the cluster's underside in long curtains.
 */
function crown(w: World, cx: number, cy: number, r: number, loam: boolean, willow: boolean): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      if (w.get(cx + dx, cy + dy) !== M.Empty || !w.rng.chance(0.85)) continue;
      w.set(cx + dx, cy + dy, loam && w.rng.chance(0.08) ? M.Flower : M.Leaf);
    }
  }
  if (!willow) return;
  for (let dx = -r; dx <= r; dx++) {
    if (!w.rng.chance(0.6)) continue;
    let hy = cy + Math.round(Math.sqrt(Math.max(0, r * r - dx * dx))) + 1;
    for (let k = w.rng.int(3, 9); k > 0 && w.get(cx + dx, hy) === M.Empty; k--, hy++) w.set(cx + dx, hy, M.Leaf);
  }
}

/**
 * A pine: a straight trunk, bare at the foot, under a tapering crown of dark needles in tiers,
 * widest low down and narrowing to a spire. Its needles now and then drop a cone.
 */
function growPine(w: World, x: number, y: number, i: number, height: number): boolean {
  if (!thrives(w, x, y, 0.2)) return true;
  const start = w.vel[i];
  const above = w.get(x, y - 1);
  w.setCell(i, M.Wood);
  // Tiers of needles every other cell above the bare foot, each wider the lower down it is.
  if (height < start * 0.75 && height % 2 === 0) {
    const half = 1 + Math.round(height * 0.35);
    for (let dx = 1; dx <= half; dx++) {
      for (let d = -1; d <= 1; d += 2) {
        // The tier's outer ends droop a cell.
        const ny = dx > half * 0.6 ? y + 1 : y;
        if (w.get(x + d * dx, ny) === M.Empty) w.set(x + d * dx, ny, M.Needles);
        if (dx <= half * 0.7 && w.get(x + d * dx, y - 1) === M.Empty) w.set(x + d * dx, y - 1, M.Needles);
      }
    }
  }
  if (height > 1 && (above === M.Empty || above === M.Needles)) {
    climb(w, x, y - 1, PINE_TIP, height - 1, start);
  } else {
    // The spire.
    for (let k = 1; k <= 3; k++) if (w.get(x, y - k) === M.Empty) w.set(x, y - k, M.Needles);
    for (let d = -1; d <= 1; d += 2) if (w.get(x + d, y - 1) === M.Empty) w.set(x + d, y - 1, M.Needles);
  }
  return true;
}

/** How steeply each of a palm's three fronds a side sets out: rising, level, falling. */
const FROND_RISE: readonly number[] = [1, 0.45, 0];

/**
 * A palm: a tall, thin, slightly leaning trunk with no branches, topped with a tuft of long fronds
 * arching out and drooping, and a few coconuts (fruit) under them.
 */
function growPalm(w: World, x: number, y: number, i: number, height: number): boolean {
  if (!thrives(w, x, y, 0.2)) return true;
  const start = w.vel[i];
  // It leans one way (fixed by its starting height), gently, in its upper part.
  const lean = start % 2 === 0 ? 1 : -1;
  const nx = height < start * 0.6 && w.rng.chance(0.2) ? x + lean : x;
  const above = w.get(nx, y - 1);
  w.setCell(i, M.Wood);
  if (height > 1 && above === M.Empty) {
    climb(w, nx, y - 1, PALM_TIP, height - 1, start);
    return true;
  }
  // Fronds: three a side, rising, level and falling, each arching over and drooping at the tip.
  for (let d = -1; d <= 1; d += 2) {
    for (const rise of FROND_RISE) {
      const length = w.rng.int(5, 8);
      for (let k = 1; k <= length; k++) {
        const fy = y - 1 - Math.round(rise * k) + Math.round(0.11 * k * k);
        if (w.get(x + d * k, fy) === M.Empty) w.set(x + d * k, fy, M.Leaf);
      }
    }
  }
  if (w.get(x, y - 1) === M.Empty) w.set(x, y - 1, M.Leaf);
  for (let d = -1; d <= 1; d += 2) if (w.rng.chance(0.7) && w.get(x + d, y + 1) === M.Empty) w.set(x + d, y + 1, M.Fruit);
  return true;
}

/**
 * A giant tree (rare, on rich ground): a broadleaf grown huge. Its trunk is three cells thick low
 * down and two higher up, it throws out long forking boughs with big clusters of leaves, and it
 * finishes in a vast crown.
 */
function growGiant(w: World, x: number, y: number, i: number, height: number): boolean {
  if (!thrives(w, x, y, 0.2)) return true;
  const start = w.vel[i];
  const nx = w.rng.chance(0.05) ? x + w.rng.sign() : x;
  const above = w.get(nx, y - 1);
  w.setCell(i, M.Wood);
  if (height > start * 0.4) wood(w, x - 1, y);
  if (height > start * 0.15) wood(w, x + 1, y);
  if (height > 1 && (above === M.Empty || above === M.Leaf)) {
    climb(w, nx, y - 1, GIANT_TIP, height - 1, start);
    if (height < start * 0.7 && height > 8 && w.rng.chance(0.12)) growBranch(w, x, y, w.rng.sign(), false, false, w.rng.int(7, 13));
  } else {
    crown(w, x, y - 4, w.rng.int(9, 12), false, false);
    for (let d = -1; d <= 1; d += 2) crown(w, x + d * w.rng.int(7, 10), y - 1, w.rng.int(5, 7), false, false);
  }
  return true;
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

/** Per frame, the chance that ash lying on soil sinks one cell into it, and that buried ash is taken up. */
const ASH_SINK = 0.0007;
const ASH_TAKEN_UP = 0.002;

/** Soil that ash soaks into. */
function soaksAsh(t: MaterialId): boolean {
  return t === M.Earth || t === M.Loam || t === M.Grass;
}

/**
 * Ash: lying on soil, it slowly soaks in, now and then trading places with the soil below it, and
 * once it's in the ground (soil above and below) it's taken up, enriching the soil into loam. A heap
 * soaks in from the bottom, a grain at a time in each column. A burnt forest floor keeps its ash bed
 * long enough for seeds to come up in it, then the ash sinks in over a minute or two instead of
 * heaping up for ever. (Worms work it in faster: see updateWorm.) Otherwise it mixes into cement.
 * Soil lying on top of ash doesn't count: earth dropped (or a worm dying) on an ash heap leaves it be.
 */
export function updateAsh(w: World, x: number, y: number, i: number): boolean {
  if (w.pinned[i] === 0 && soaksAsh(w.get(x, y + 1))) {
    if (soaksAsh(w.get(x, y - 1))) {
      if (w.rng.chance(ASH_TAKEN_UP)) {
        w.transform(i, M.Loam);
        return true;
      }
    } else if (soaksAsh(w.get(x, y + 2)) && w.rng.chance(ASH_SINK)) {
      // Only into solid ground (soil under soil), so a grain it pushed up can't rise on through the heap.
      const n = w.idx(x, y + 1);
      if (w.pinned[n] === 0) {
        w.swap(i, n);
        return true;
      }
    }
  }
  return formCement(w, x, y, i);
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
  // In the wind, now and then a seed blows off it, carried away downwind to sprout somewhere new.
  if (w.wind !== 0 && w.rng.chance(0.0004 * Math.abs(w.wind))) {
    const d = w.wind > 0 ? 1 : -1;
    if (w.get(x + d, y - 1) === M.Empty) {
      w.set(x + d, y - 1, M.Seed);
      if (w.inBounds(x + d, y - 1)) w.launch(w.idx(x + d, y - 1), d * (1 + w.rng.next() * 1.5), -0.6);
    }
  }
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
    w.noise.bursts++;
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
  w.noise.fizzes++;
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
  // Deep in a lava lake, with lava on every side, there's nothing to set alight or react with:
  // skip straight on (most of a big lake is interior, so this is most of its cost saved).
  if (w.get(x, y - 1) === M.Lava && w.get(x, y + 1) === M.Lava && w.get(x - 1, y) === M.Lava && w.get(x + 1, y) === M.Lava) {
    return false;
  }
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
/**
 * A drop of water just under or beside something icy (x, y), with open air below the drop, freezes
 * onto it as an icicle, so icicles grow down where water drips past ice. (Water under the ice of a
 * frozen pond has more water below it, not air, so ponds don't sprout icicles.)
 */
function freezeDrip(w: World, x: number, y: number): void {
  for (let k = 0; k < 3; k++) {
    const nx = k === 0 ? x : k === 1 ? x - 1 : x + 1;
    const ny = k === 0 ? y + 1 : y;
    if (w.get(nx, ny) === M.Water && w.get(nx, ny + 1) === M.Empty && w.rng.chance(0.3)) w.transform(w.idx(nx, ny), M.Icicle);
  }
}

/** Icicle: while it's below freezing, drips of water passing it freeze on, and it grows. */
export function growIcicle(w: World, x: number, y: number, i: number): boolean {
  if (w.temp[i] < 0) freezeDrip(w, x, y);
  return true;
}

export function freezeWater(w: World, x: number, y: number, i: number): boolean {
  // An ice crystal frozen out of the sky falls (through air and gases) until it lands. Without
  // this it hung at the top of the sky for ever, growing icicles from the water condensing beside it.
  if (w.life[i] === FALLING_ICE) {
    const below = w.get(x, y + 1);
    const kind = below === M.Empty ? 'gas' : w.defAt(x, y + 1).kind;
    if (kind === 'gas') {
      w.swap(i, w.idx(x, y + 1));
      return true;
    }
    // A raindrop falling just below: wait for it, rather than landing on it in mid-air.
    if (kind === 'liquid' && (w.get(x, y + 2) === M.Empty || w.defAt(x, y + 2).kind === 'gas')) return true;
    // Landed. On anything above freezing it melts, like a hailstone (ice keeps itself cold, so a
    // crystal kept as ice in a warm sea would slowly freeze the sea); on frozen ground it stays.
    if (!w.inBounds(x, y + 1) || w.temp[w.idx(x, y + 1)] >= 0) {
      w.setCell(i, M.Water);
      return true;
    }
    w.life[i] = 0;
  }
  if (w.temp[i] >= 0) return true;
  freezeDrip(w, x, y);
  if (!w.rng.chance(0.01)) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  if (w.get(nx, ny) === M.Water) w.set(nx, ny, M.Ice);
  return true;
}

/**
 * The top of the cloud layer at column x: above it is the upper atmosphere, where red sprites
 * appear and cirrus drifts. It rolls gently along the sky and slowly drifts over time, so cloud tops
 * billow into domes and dips instead of pressing flat against one row. Three waves with unrelated
 * lengths, drifting at different speeds and in both directions, keep the domes from looking evenly
 * spaced: a long swell raises whole stretches, the middle wave makes the domes, a short one lumps
 * them. It depends only on the frame, the grid size and the column, so it's worked out once per
 * column per frame and cached (a cloud bank asks for it once per cell).
 */
let ceilingFrame = -1;
/** The world the cached values belong to (tests make many worlds of the same size). */
let ceilingWorld: World | null = null;
let ceilingWidth = 0;
let ceilingHeight = 0;
let ceilingRows = new Int16Array(0);
/** Per column, this frame: how many cells of cloud it holds, and so where its cloud's top may reach (see cloudTop). */
let cloudCounts = new Int16Array(0);
let cloudTops = new Int16Array(0);
/** Per column, this frame: its cloud's level base row, its topmost cloud cell, and the cloud it would hold in a rounded heap. */
let cloudBases = new Int16Array(0);
let cloudTopRows = new Int16Array(0);
let cloudTargets = new Int16Array(0);
/** Per column, this frame: which way its heap's middle lies (-1 left, 1 right, 0 here or no heap). */
let cloudPull = new Int8Array(0);
function cloudCeiling(w: World, x: number): number {
  if (w !== ceilingWorld || w.frame !== ceilingFrame || w.width !== ceilingWidth || w.height !== ceilingHeight) {
    if (ceilingRows.length < w.width) {
      ceilingRows = new Int16Array(w.width);
      cloudCounts = new Int16Array(w.width);
      cloudTops = new Int16Array(w.width);
      cloudBases = new Int16Array(w.width);
      cloudTopRows = new Int16Array(w.width);
      cloudTargets = new Int16Array(w.width);
      cloudPull = new Int8Array(w.width);
    }
    const base = w.height * 0.22;
    const swell = w.height * 0.03;
    const t = w.frame;
    for (let c = 0; c < w.width; c++) {
      ceilingRows[c] = Math.round(
        base + swell * (0.7 * Math.sin(c * 0.043 + t * 0.0011) + Math.sin(c * 0.11 - t * 0.002) + 0.45 * Math.sin(c * 0.29 + t * 0.0037)),
      );
    }
    // Count the cloud in each column (from the grid as it stands when the first cloud moves this
    // frame), so a deep column can tower above the cloud layer instead of hanging down below it.
    cloudCounts.fill(0);
    cloudTopRows.fill(-1);
    const mat = w.mat;
    const width = w.width;
    const cloud: number = M.Cloud;
    const storm: number = M.StormCloud;
    for (let y = 0, i = 0; y < w.height; y++) {
      for (let c = 0; c < width; c++, i++) {
        const m = mat[i];
        if (m === cloud || m === storm) {
          if (cloudCounts[c]++ === 0) cloudTopRows[c] = y;
        }
      }
    }
    // Every cloud sits on a level base (rising and falling only with the long swell across the
    // sky) and heaps upwards from it, so a column's cloud may reach up from that base by however
    // much cloud the column holds: a deep column towers.
    for (let c = 0; c < width; c++) {
      const base = Math.round(w.height * (0.22 + CLOUD_BASE) + w.height * 0.03 * 0.7 * Math.sin(c * 0.043 + t * 0.0011));
      cloudBases[c] = base;
      cloudTops[c] = Math.max(1, base - cloudCounts[c]);
    }
    heapTargets(width);
    if (w !== ceilingWorld) roseAt.fill(-1);
    ceilingWorld = w;
    ceilingFrame = w.frame;
    ceilingWidth = w.width;
    ceilingHeight = w.height;
  }
  return ceilingRows[x < 0 ? 0 : x >= w.width ? w.width - 1 : x];
}

/**
 * The mirror of riseColumn: the top cell of a column that sits above its base hops to the gap
 * beneath the column (as long as that's not below the base), so the column sinks a row as one.
 */
function sinkColumn(w: World, x: number, y: number, i: number): void {
  if (roseAt.length < w.width) roseAt = new Int32Array(w.width).fill(-1);
  if (roseAt[x] === w.frame) return;
  const base = cloudBases[x];
  for (let ty = y + 1; ty < base; ty++) {
    if (cloudPasses(w, x, ty)) {
      w.swap(i, w.idx(x, ty));
      roseAt[x] = w.frame;
      return;
    }
    if (!isCloud(w.get(x, ty))) return;
  }
}

/**
 * Clouds' level base lies this far (as a fraction of the sky's height: 10 rows at the default
 * size) below the cloud layer's mean height. Clouds heap up from
 * it, flat underneath and domed on top like cumulus (and a deep one towers, like cumulonimbus),
 * rather than hanging down from the layer like a sack.
 */
const CLOUD_BASE = 0.05;

/** A cloud gathers into a heap about this many times as wide as it is tall. */
const HEAP_ASPECT = 3.5;

/**
 * For each cloud (a run of columns holding cloud), the rounded heap it would gather into: half an
 * ellipse HEAP_ASPECT times as wide as it is tall, holding the same amount of cloud, centred where
 * the cloud's weight is. Small lumps along the top keep heaps from all looking alike. A heap too
 * tall for the sky above its base widens instead.
 */
function heapTargets(width: number): void {
  cloudTargets.fill(0);
  cloudPull.fill(0);
  let c = 0;
  while (c < width) {
    if (cloudCounts[c] === 0) {
      c++;
      continue;
    }
    let n = 0;
    let moment = 0;
    let room = 0;
    const start = c;
    for (; c < width && cloudCounts[c] > 0; c++) {
      n += cloudCounts[c];
      moment += c * cloudCounts[c];
      room = Math.max(room, cloudBases[c] - 1);
    }
    const centre = moment / n;
    // Half an ellipse of width W and height W / HEAP_ASPECT has area (pi / 4) W^2 / HEAP_ASPECT.
    let half = Math.sqrt((n * HEAP_ASPECT) / Math.PI);
    let height = (2 * half) / HEAP_ASPECT;
    if (height > room) {
      height = room;
      half = (2 * n) / (Math.PI * height);
    }
    const from = Math.max(0, Math.ceil(centre - half));
    const to = Math.min(width - 1, Math.floor(centre + half));
    for (let k = from; k <= to; k++) {
      const d = (k - centre) / half;
      // Broad lumps (a couple of dozen columns apart), so a big heap shows separate rounded lobes.
      const lumps = 1 + 0.1 * Math.sin(k * 0.26 + start);
      const target = Math.round(height * Math.sqrt(Math.max(0, 1 - d * d)) * lumps);
      if (target > cloudTargets[k]) cloudTargets[k] = target;
    }
    for (let k = start; k < c; k++) cloudPull[k] = k < centre - 0.5 ? 1 : k > centre + 0.5 ? -1 : 0;
  }
}

/**
 * The top cell of a column holding more cloud than its share of the heap hops onto the top of a
 * neighbouring column holding less, so cloud flows from a cloud's thin, spread-out edges in
 * towards its middle and piles up there.
 */
function heapUp(w: World, x: number, i: number): boolean {
  const excess = cloudCounts[x] - cloudTargets[x];
  const pull = cloudPull[x];
  // Inwards, towards the heap's middle, whenever the next column in holds less than its share;
  // outwards (a spike slumping) only when the next column out holds at least two less. Either
  // way the move can't be undone by the opposite one, so cells don't shuttle to and fro.
  const first = pull === 0 ? w.rng.sign() : pull;
  const d = heapStep(w, x, excess, first, pull) ? first : heapStep(w, x, excess, -first, pull) ? -first : 0;
  if (d === 0) return false;
  const nx = x + d;
  // It lands on top of the neighbouring column's body, found from the base up (not on a stray
  // cell higher up, or a chain of them would grow up into the sky).
  let ny = cloudBases[nx] - 1;
  for (let k = 0; k < 6 && ny >= 1 && !isCloud(w.get(nx, ny)); k++) ny--;
  if (isCloud(w.get(nx, ny))) while (ny >= 1 && isCloud(w.get(nx, ny))) ny--;
  else ny = cloudBases[nx] - 1;
  if (ny < 1 || !cloudPasses(w, nx, ny)) return false;
  w.swap(i, w.idx(nx, ny));
  // Keep this frame's tallies roughly right, so a column doesn't give away more than it should.
  cloudCounts[x]--;
  cloudCounts[nx]++;
  return true;
}

/** Whether cloud should flow from column x one column in direction `dir` (see heapUp). */
function heapStep(w: World, x: number, excess: number, dir: number, pull: number): boolean {
  const nx = x + dir;
  if (nx < 0 || nx >= w.width) return false;
  return excess - (cloudCounts[nx] - cloudTargets[nx]) >= (dir === pull ? 1 : 2);
}

/** The highest row cloud in column x may reach this frame: its base, less the cloud the column holds. */
function cloudTop(w: World, x: number): number {
  cloudCeiling(w, x);
  return cloudTops[x < 0 ? 0 : x >= w.width ? w.width - 1 : x];
}

/**
 * Clouds. Two kinds make up the body of the sky's clouds, and they behave as one cloud:
 *   Cloud (fair-weather cumulus): white, puffy, long-lasting; it only drizzles now and then.
 *   Storm cloud (cumulonimbus): the lower part of a cloud piled deep (STORM_DEPTH rows or more of
 *     cloud above it) darkens into storm cloud, which rains hard and makes the lightning (with its
 *     corona and red sprites). As it rains itself out and the cloud above thins below STORM_CLEAR
 *     rows, it clears back into fair-weather cloud. So a big cloud towers white over a dark,
 *     pouring base, then settles into a fair-weather cloud.
 * They move as a body, not a gas (see moveCloud). Rain is the cloud itself coming down.
 */
function isCloud(t: number): boolean {
  return t === M.Cloud || t === M.StormCloud;
}

/** Whether a cloud can move through a cell: open air, or another gas (which it simply displaces). */
function cloudPasses(w: World, x: number, y: number): boolean {
  const t = w.get(x, y);
  return t === M.Empty || (!isCloud(t) && w.defAt(x, y).kind === 'gas');
}

/** Chance per frame that a cell on the base of a fair-weather cloud turns to rain: now and then. */
const CLOUD_DRIZZLE = 0.0005;
/** A storm cloud's base rains far harder, and harder still per CLOUD_DEPTH_STEP rows of cloud above. */
const STORM_RAIN = 0.004;
const STORM_POUR = 0.003;
const CLOUD_DEPTH_STEP = 4;
/** Rows of cloud above a cell that turn it to storm cloud; fewer than STORM_CLEAR, and it clears. */
const STORM_DEPTH = 20;
const STORM_CLEAR = 14;

/** How many rows of cloud lie above (x, y), counting up to `limit` (one-cell gaps don't end it). */
function cloudRowsAbove(w: World, x: number, y: number, limit: number): number {
  let n = 0;
  for (let yy = y - 1; yy >= 0 && n < limit; yy--) {
    if (isCloud(w.get(x, yy))) n++;
    else if (!isCloud(w.get(x, yy - 1))) break;
  }
  return n;
}

/** The cloud cell i at (x, y) turns into a raindrop (or snow, hail or acid rain): the cloud coming down. */
function rainDrop(w: World, x: number, y: number, i: number): void {
  w.setCell(i, M.Empty);
  rainFrom(w, x, y - 1);
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
  for (let k = 1; k <= 3; k++) if (isCloud(w.get(x - d * k, y))) return false;
  // It goes to the row's leading edge: the first gap with open air beyond it (or, if something
  // solid is in the way, the last hole before that). Raindrops inside the cloud don't stop it.
  let hole = 0;
  for (let k = 1, end = d > 0 ? w.width - x : x + 1; k < end; k++) {
    const t = w.get(x + d * k, y);
    if (t === M.Empty) {
      hole = k;
      if (!isCloud(w.get(x + d * (k + 1), y)) && !isCloud(w.get(x + d * (k + 2), y)) && !isCloud(w.get(x + d * (k + 3), y))) break;
    } else if (!isCloud(t) && w.isSolid(x + d * k, y)) break;
  }
  if (hole === 0) return false;
  w.swap(i, w.idx(x + d * hole, y));
  return true;
}

/**
 * Below the cloud layer, every column of cloud rises a row once every CLOUD_RISE_EVERY frames
 * (about 12 rows a second), all on the same frame, so a cloud floats up as one block: if each column
 * rose at random moments, neighbouring columns would drift rows apart and the cloud would streak.
 */
const CLOUD_RISE_EVERY = 5;
/** Per column, the frame it last rose in: once its bottom cell has hopped up, the cell above it (now the bottom) must wait. */
let roseAt = new Int32Array(0);

/**
 * A column of cloud rises as one: the cell at its bottom hops to the first gap above the column (a
 * hole inside the cloud, or open air at its top, as long as that's not in the upper atmosphere), so
 * the column moves up a row with no gaps opening in it, and holes fill in from below.
 */
function riseColumn(w: World, x: number, y: number, i: number, ceiling: number): boolean {
  if (roseAt.length < w.width) roseAt = new Int32Array(w.width).fill(-1);
  if (roseAt[x] === w.frame) return false;
  for (let ty = y - 1; ty >= ceiling; ty--) {
    if (cloudPasses(w, x, ty)) {
      w.swap(i, w.idx(x, ty));
      roseAt[x] = w.frame;
      return true;
    }
    if (!isCloud(w.get(x, ty))) return false;
  }
  return false;
}

/**
 * How a cloud moves: as a body, not a gas. The wind carries it whole (cloudDrift). Each column of
 * cloud settles onto the level cloud base, rising (riseColumn) or sinking (sinkColumn) a whole
 * column at a time, so a cloud drawn low lifts as a block and one drawn high comes down. On the
 * base it heaps up: cloud flows from its thin edges towards its middle (heapUp), and spikes and
 * corners melt into the dents beside them (roundCloud), so it gathers into a cumulus heap, flat
 * underneath and domed on top. A lone wisp with hardly any cloud around it slowly evaporates back
 * into vapour (clean edges).
 */
function moveCloud(w: World, x: number, y: number, i: number): boolean {
  if (w.wind !== 0 && w.rng.chance(Math.abs(w.wind) * CLOUD_DRIFT) && cloudDrift(w, x, y, i)) return true;
  const ceiling = cloudTop(w, x);
  // Above where its column's cloud should reach (with a row of slack, so cells at the top don't
  // bob up and down as the column's count changes): a stray cell sinks, and a whole column sitting
  // too high, above its base, drops its top cell into the gap beneath it.
  if (y < ceiling - 1) {
    if (w.get(x, y + 1) === M.Empty) {
      if (w.rng.chance(0.3)) w.swap(i, w.idx(x, y + 1));
    } else if (w.frame % CLOUD_RISE_EVERY === 0 && !isCloud(w.get(x, y - 1))) sinkColumn(w, x, y, i);
    return true;
  }
  if (w.rng.chance(0.005) && countAround(w, x, y, M.Cloud, M.StormCloud) <= 2) {
    // Back into invisible vapour, which drifts until it gathers with more and condenses again.
    w.setCell(i, M.Vapour);
    return true;
  }
  const above = w.get(x, y - 1);
  if (!isCloud(above) && w.rng.chance(HEAP_FLOW) && heapUp(w, x, i)) return true;
  // The bottom of a column carries the whole column up a row.
  if (w.frame % CLOUD_RISE_EVERY === 0 && !isCloud(w.get(x, y + 1)) && riseColumn(w, x, y, i, ceiling)) return true;
  if (w.rng.chance(CLOUD_ROUNDING)) roundCloud(w, x, y, i);
  return true;
}

/** Chance per frame that the top cell of a column tries to flow towards the middle of its heap (see heapUp). */
const HEAP_FLOW = 0.4;

/** Chance per frame that a cloud cell tries to settle into a more sheltered spot (see roundCloud). */
const CLOUD_ROUNDING = 0.08;

/**
 * Rounds a cloud off, like surface tension: a cell hops to a nearby gap (up to two cells away) if
 * it would have clearly more cloud around it there than where it is, so spikes and sharp corners
 * melt into the dents and holes beside them. (Only clearly: a gentler rule would also pull every
 * cell off the top of a heap into its edges and flatten it.)
 */
function roundCloud(w: World, x: number, y: number, i: number): void {
  const nx = x + w.rng.int(-2, 2);
  const ny = y + w.rng.int(-2, 2);
  if ((nx === x && ny === y) || ny < 1 || w.get(nx, ny) !== M.Empty) return;
  const here = countAround(w, x, y, M.Cloud, M.StormCloud);
  // Its own cell will be empty once it has moved, so it doesn't count as a neighbour there.
  const adjacent = Math.abs(nx - x) <= 1 && Math.abs(ny - y) <= 1 ? 1 : 0;
  const there = countAround(w, nx, ny, M.Cloud, M.StormCloud) - adjacent;
  if (there >= here + 2) w.swap(i, w.idx(nx, ny));
}

/** Above this many rows over the cloud layer, rising vapour freezes into cirrus instead of cloud. */
const CIRRUS_GAP = 6;

/**
 * Water vapour (from water evaporating in the sun) rises to the cloud layer (or a roof, where it
 * condenses back into water) and condenses into
 * cloud there, sooner beside cloud that's already there, so clouds grow where vapour gathers. Vapour
 * that slips past the cloud layer into the upper atmosphere freezes into thin cirrus instead.
 */
export function updateVapour(w: World, x: number, y: number, i: number): boolean {
  const ceiling = cloudCeiling(w, x);
  // Rising against a roof below the clouds (glass, stone, a cave ceiling), it condenses on the
  // underside and drips back as fresh water: the way a solar still works.
  if (y > ceiling + 3 && w.rng.chance(0.01) && w.get(x, y - 1) !== M.Empty && w.isSolid(x, y - 1)) {
    w.transform(i, M.Water);
    return true;
  }
  if (y < ceiling - CIRRUS_GAP) {
    if (w.rng.chance(0.01)) {
      w.transform(i, M.Cirrus);
      return true;
    }
  } else if (y <= ceiling + 3) {
    // At the cloud layer, vapour condenses onto cloud that's already there, or once enough has
    // gathered; until then it hangs there, drifting, so it condenses in clumps rather than as lone
    // specks. A little slips on upwards and becomes cirrus.
    if (countAround(w, x, y, M.Cloud, M.StormCloud) > 0 ? w.rng.chance(0.3) : countAround(w, x, y, M.Vapour, M.Vapour) >= 3 && w.rng.chance(0.05)) {
      w.transform(i, M.Cloud);
      return true;
    }
    if (w.rng.chance(0.03)) return false;
    const nx = x + (w.wind !== 0 && w.rng.chance(Math.abs(w.wind)) ? Math.sign(w.wind) : w.rng.sign());
    const ny = y + w.rng.int(-1, 1);
    if (ny >= ceiling - CIRRUS_GAP && w.get(nx, ny) === M.Empty) w.swap(i, w.idx(nx, ny));
    return true;
  }
  return false;
}

/**
 * Cirrus: thin, high wisps of ice crystals. It stays in the upper atmosphere (rising back if it
 * sinks to the cloud layer), never rains, lets the sun through, and is smeared out by the wind
 * (it drifts cell by cell, like a gas), fading away after a minute or so.
 */
export function updateCirrus(w: World, x: number, y: number, i: number): boolean {
  const ceiling = cloudCeiling(w, x);
  if (y > ceiling - 3 && w.get(x, y - 1) === M.Empty && w.rng.chance(0.3)) {
    w.swap(i, w.idx(x, y - 1));
    return true;
  }
  // High enough: it stops climbing and only streams sideways, so it hangs as streaks across the
  // sky instead of piling into a white band along the very top.
  if (y < ceiling - CIRRUS_HIGH) {
    const d = w.wind !== 0 && w.rng.chance(Math.abs(w.wind) * 0.9) ? Math.sign(w.wind) : w.rng.chance(0.2) ? w.rng.sign() : 0;
    if (d !== 0 && w.get(x + d, y) === M.Empty) w.swap(i, w.idx(x + d, y));
    else if (w.rng.chance(0.02) && w.get(x, y + 1) === M.Empty) w.swap(i, w.idx(x, y + 1));
    return true;
  }
  return false;
}
/** Rows above the cloud layer where cirrus stops rising. */
const CIRRUS_HIGH = 14;

/** Frames of charge building (corona) between a cloud deciding to strike and the bolt. */
const STRIKE_CHARGE: readonly [number, number] = [40, 70];

/** Fair-weather cloud: drizzles now and then; piled deep, it darkens into storm cloud. */
export function rainCloud(w: World, x: number, y: number, i: number): boolean {
  // (The column's tally, brought up to date by cloudCeiling, rules most cells out cheaply before
  // counting the rows above.)
  cloudCeiling(w, x);
  if (w.rng.chance(0.03) && y - cloudTopRows[x] >= STORM_DEPTH && cloudRowsAbove(w, x, y, STORM_DEPTH) >= STORM_DEPTH) {
    w.transform(i, M.StormCloud);
    return true;
  }
  if (w.get(x, y + 1) === M.Empty && w.rng.chance(CLOUD_DRIZZLE)) {
    rainDrop(w, x, y, i);
    return true;
  }
  return moveCloud(w, x, y, i);
}

/**
 * Storm cloud: rains hard (harder the deeper the cloud above), and deep inside, very rarely,
 * lightning: first the charge builds for a second or so (the corona crackle you can hear before a
 * close strike), counted down in `vel`, then it strikes. Once the cloud above has thinned, it
 * clears back into fair-weather cloud.
 */
let strikeWorld: World | null = null;
let nextStrikeFrame = 0;
/** Frames between one strike starting to charge and the next one being allowed, anywhere in the world. */
const STRIKE_GAP: readonly [number, number] = [40, 160];

export function stormCloud(w: World, x: number, y: number, i: number): boolean {
  const charging = w.vel[i];
  if (charging > 0) {
    w.noise.corona++;
    w.vel[i] = charging - 1;
    if (charging === 1) strike(w, x, y);
  } else if (
    (w.frame >= nextStrikeFrame || w !== strikeWorld) &&
    w.rng.chance(0.00004) &&
    countAround(w, x, y, M.Cloud, M.StormCloud) >= 6
  ) {
    // However big the storm, strikes come one at a time, a second or two apart: a huge storm
    // cloud would otherwise flicker with bolts and fill the sky with sprites.
    w.vel[i] = w.rng.int(STRIKE_CHARGE[0], STRIKE_CHARGE[1]);
    strikeWorld = w;
    nextStrikeFrame = w.frame + w.rng.int(STRIKE_GAP[0], STRIKE_GAP[1]);
  }
  if (charging === 0 && w.rng.chance(0.01) && cloudRowsAbove(w, x, y, STORM_CLEAR) < STORM_CLEAR) {
    w.transform(i, M.Cloud);
    return true;
  }
  if (w.get(x, y + 1) === M.Empty) {
    const deep = Math.max(0, cloudRowsAbove(w, x, y, STORM_CLEAR + 5 * CLOUD_DEPTH_STEP) - STORM_CLEAR);
    if (w.rng.chance(STORM_RAIN + STORM_POUR * Math.floor(deep / CLOUD_DEPTH_STEP))) {
      rainDrop(w, x, y, i);
      return true;
    }
  }
  return moveCloud(w, x, y, i);
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

/**
 * Seaweed (kelp): only the tip of each stalk grows, up into the salt water above, wavering a little
 * as it goes and now and then putting out a frond to the side. The taller it is, the likelier it
 * stops (for good), so stalks reach mixed heights instead of every cell sprouting and the whole bed
 * filling out into a solid wedge. Its height is kept in `life`; -1 means it has stopped (or is a
 * frond, which never grows).
 */
export function growSeaweed(w: World, x: number, y: number, i: number): boolean {
  if (!w.rng.chance(0.01) || w.life[i] < 0) return true;
  // Not the tip: something of the stalk already grows above it.
  if (w.get(x, y - 1) === M.Seaweed || w.get(x - 1, y - 1) === M.Seaweed || w.get(x + 1, y - 1) === M.Seaweed) return true;
  const height = w.life[i];
  if (w.rng.chance(height / KELP_REACH)) {
    w.life[i] = -1;
    return true;
  }
  const nx = w.rng.chance(0.3) ? x + w.rng.sign() : x;
  if (w.get(nx, y - 1) !== M.SaltWater) return true;
  w.set(nx, y - 1, M.Seaweed);
  w.life[w.idx(nx, y - 1)] = height + 1;
  // Now and then a frond to one side, which doesn't grow on.
  if (height > 2 && w.rng.chance(0.25)) {
    const fx = x + w.rng.sign();
    if (w.get(fx, y) === M.SaltWater) {
      w.set(fx, y, M.Seaweed);
      w.life[w.idx(fx, y)] = -1;
    }
  }
  return true;
}
/** Each growth step, a stalk this tall stops for good with chance height / KELP_REACH (most reach 12-30). */
const KELP_REACH = 250;

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
  // Moss is the other way round: with the sun out, it thrives in shade and dries back in the open.
  if (!thrives(w, x, y, 0.01, true)) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  if (w.get(nx, ny) !== M.Empty) return true;
  if (!(isMasonry(w.get(nx - 1, ny)) || isMasonry(w.get(nx + 1, ny)) || isMasonry(w.get(nx, ny - 1)) || isMasonry(w.get(nx, ny + 1)))) {
    return true;
  }
  if (w.near(nx, ny, DAMP_RANGE, M.Water)) w.set(nx, ny, M.Moss);
  return true;
}

/**
 * Algae: floats; now and then spreads into a neighbouring water cell at the surface, in patches
 * (not where the surface nearby is already mostly algae), and now and then dies back. So a pond
 * keeps open water between drifting rafts, and its fish keep their water to breathe.
 */
export function spreadAlgae(w: World, x: number, y: number, i: number): boolean {
  if (w.rng.chance(0.0003) && w.get(x, y + 1) === M.Water) {
    w.setCell(i, M.Water);
    return true;
  }
  if (!w.rng.chance(0.005)) return false;
  const nx = x + w.rng.sign();
  const ny = y + w.rng.int(0, 1);
  if (w.get(nx, ny) !== M.Water || w.get(nx, ny - 1) !== M.Empty) return false;
  let crowd = 0;
  for (let dx = -4; dx <= 4; dx++) if (w.get(nx + dx, ny) === M.Algae || w.get(nx + dx, ny - 1) === M.Algae) crowd++;
  if (crowd < 5) w.set(nx, ny, M.Algae);
  return false;
}

/**
 * A lightning strike from (x, y): a jagged bolt down through air and gas until it hits something,
 * which it electrifies if it conducts, or else sets alight. Now and then the same discharge throws
 * red sprites up into the clear sky above the cloud.
 */
/** How far to either side a strike will bend to reach a lightning rod. */
const ROD_REACH = 12;

/**
 * The lightning rod a strike from (x, y) heads for: the highest solid conductor standing within
 * ROD_REACH columns, where there's height enough to bend over to it. Returns its column, or -1.
 */
function findRod(w: World, x: number, y: number): number {
  let best = -1;
  let bestY = w.height;
  for (let dx = -ROD_REACH; dx <= ROD_REACH; dx++) {
    const rx = x + dx;
    if (rx < 0 || rx >= w.width) continue;
    for (let ry = y + 1; ry < bestY; ry++) {
      const def = w.defAt(rx, ry);
      if (isCloud(def.id) || def.kind === 'empty' || def.kind === 'gas') continue;
      if (def.kind === 'liquid') continue; // rain, or a film of water lying on the rod
      // The first solid thing below the cloud in this column: is it a conductor, high enough?
      if (def.conducts && def.kind === 'static' && ry - y > Math.abs(dx) && (ry < bestY || Math.abs(dx) < Math.abs(best - x))) {
        best = rx;
        bestY = ry;
      }
      break;
    }
  }
  return best;
}

/** A strike ending in sand fuses a branching tube of fulgurite down into it. */
function fuseSand(w: World, x: number, y: number): void {
  let fx = x;
  for (let fy = y, k = w.rng.int(3, 8); k > 0 && w.get(fx, fy) === M.Sand; k--) {
    w.transform(w.idx(fx, fy), M.Fulgurite);
    if (w.rng.chance(0.3) && w.get(fx + 1, fy) === M.Sand) w.transform(w.idx(fx + 1, fy), M.Fulgurite);
    fy++;
    fx += w.rng.int(-1, 1);
  }
}

function strike(w: World, x: number, y: number): void {
  w.noise.strikes++;
  if (w.rng.chance(0.35)) spawnSprites(w, x, y);
  // A lightning rod nearby draws the bolt: it bends towards it as it comes down.
  const rod = findRod(w, x, y);
  let bx = x;
  for (let by = y + 1; by < w.height; by++) {
    bx += rod >= 0 && bx !== rod && w.rng.chance(0.8) ? Math.sign(rod - bx) : w.rng.int(-1, 1);
    const def = w.defAt(bx, by);
    if (isCloud(def.id)) continue;
    if (def.kind === 'empty' || def.kind === 'gas') {
      w.set(bx, by, M.Lightning);
      continue;
    }
    // Straight through the falling rain (and any water lying on the rod it's heading for).
    if (def.kind === 'liquid' && (w.vel[w.idx(bx, by)] > 0 || bx === rod)) continue;
    if (w.inBounds(bx, by)) {
      const n = w.idx(bx, by);
      if (def.id === M.Sand) fuseSand(w, bx, by);
      else if (isFertileSoil(def.id)) feedSoil(w, bx, by);
      else {
        // Rain puddled on the ground: the nitrates still wash into the soil a little way below.
        if (def.id === M.Water) {
          for (let dy = 1; dy <= 6; dy++) {
            const t = w.get(bx, by + dy);
            if (isFertileSoil(t)) feedSoil(w, bx, by + dy);
            if (t !== M.Water) break;
          }
        }
        if (!w.electrify(n)) w.ignite(n);
      }
    }
    return;
  }
}

/**
 * A bolt striking soil fixes nitrogen from the air, as real lightning does: it leaves a little
 * saltpetre (nitrate) where it hit and in the ground around, and grass flourishes on it.
 */
function isFertileSoil(t: number): boolean {
  return t === M.Earth || t === M.Loam || t === M.Grass;
}

function feedSoil(w: World, x: number, y: number): void {
  for (let dy = 0; dy <= 2; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = w.get(x + dx, y + dy);
      if (isFertileSoil(t) && (dx === 0 && dy === 0 ? true : w.rng.chance(0.35))) {
        w.transform(w.idx(x + dx, y + dy), M.Saltpetre);
      }
    }
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
    // Anomalies: lightning striking a magnet wrapped in plasma turns gravity round (a lift field);
    // striking graphite under salt water, insulation fails (an arc node).
    else if (t === M.Magnet && countAround(w, nx, ny, M.Plasma, M.Plasma) > 0 && w.rng.chance(0.3)) w.transform(n, M.LiftField);
    else if (t === M.Graphite && countAround(w, nx, ny, M.SaltWater, M.SaltWater) > 0 && w.rng.chance(0.3)) w.transform(n, M.ArcNode);
    // Lightning striking an arc node tears it open into a gate, linked to every other gate.
    else if (t === M.ArcNode && w.rng.chance(0.15)) w.transform(n, M.LinkedGate);
    else if (t === M.Iron && w.rng.chance(0.05)) w.transform(n, M.Magnet);
    // An arc through charcoal or coal turns it to graphite.
    else if ((t === M.Charcoal || t === M.Coal) && w.rng.chance(0.2)) w.transform(n, M.Graphite);
    // A bolt drawn into sand fuses it into fulgurite.
    else if (t === M.Sand && w.rng.chance(0.05)) w.transform(n, M.Fulgurite);
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
export function pulseBattery(w: World, x: number, y: number, i: number): boolean {
  // Fed pulses from another source (a solar cell, another battery), it becomes rechargeable.
  if (w.pulseBeside(x, y) && w.rng.chance(0.3)) {
    w.transform(i, M.Accumulator);
    return true;
  }
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

/** Reach to a random cell within `reach` of (x, y) and, if it's iron filings or rust, pull it a step closer. */
function attract(w: World, x: number, y: number, reach: number): void {
  const tx = x + w.rng.int(-reach, reach);
  const ty = y + w.rng.int(-reach, reach);
  const t = w.get(tx, ty);
  if (t !== M.IronFilings && t !== M.Rust) return;
  const sx = tx + Math.sign(x - tx);
  const sy = ty + Math.sign(y - ty);
  if (w.get(sx, sy) === M.Empty) w.swap(w.idx(tx, ty), w.idx(sx, sy));
}
const MAGNET_REACH = 8;
const ELECTROMAGNET_REACH = 6;

/** Is there open air beside or above (x, y), for the wind to catch? */
function inTheOpen(w: World, x: number, y: number): boolean {
  return w.get(x - 1, y) === M.Empty || w.get(x + 1, y) === M.Empty || w.get(x, y - 1) === M.Empty;
}

/**
 * Magnet: now and then pulls iron filings or rust a step closer. A magnet touching copper, out in
 * the wind, now and then becomes a dynamo (the wind turning a magnet in a copper coil).
 */
export function pullIron(w: World, x: number, y: number, i: number): boolean {
  if (w.wind !== 0 && w.rng.chance(0.002 * Math.abs(w.wind)) && touches(w, x, y, M.Copper) && inTheOpen(w, x, y)) {
    w.transform(i, M.Dynamo);
    return true;
  }
  if (w.rng.chance(0.3)) attract(w, x, y, MAGNET_REACH);
  return true;
}

/** Iron carrying a pulse is an electromagnet: while it's live, it pulls iron filings towards it. */
export function electromagnet(w: World, x: number, y: number, i: number): boolean {
  if (w.charge[i] === 0) return false;
  attract(w, x, y, ELECTROMAGNET_REACH);
  attract(w, x, y, ELECTROMAGNET_REACH);
  return false;
}

/** Is liquid pouring onto (x, y) from above (falling, just above it)? */
function pouredOn(w: World, x: number, y: number): boolean {
  for (let k = 1; k <= 2; k++) {
    if (!w.inBounds(x, y - k)) return false;
    if (w.defAt(x, y - k).kind === 'liquid' && w.vel[w.idx(x, y - k)] > 0) return true;
  }
  return false;
}

/**
 * Dynamo: turned by the wind (with open air beside it) or by liquid pouring onto it (a water
 * wheel), it pulses touching conductors: as often as a battery at full turn.
 */
export function spinDynamo(w: World, x: number, y: number, _i: number): boolean {
  const turn = pouredOn(w, x, y) ? 1 : w.wind !== 0 && inTheOpen(w, x, y) ? Math.abs(w.wind) : 0;
  if (turn === 0 || !w.rng.chance(0.02 * turn)) return true;
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (w.inBounds(nx, ny)) w.electrify(w.idx(nx, ny));
  }
  return true;
}

/** Molten glass: caught by the wind at its surface, it now and then spins out into glass fibre. */
/** Caramel: hot and runny, caught by the wind at its surface, it now and then spins out into candy floss. */
export function spinCandyFloss(w: World, x: number, y: number, i: number): boolean {
  if (w.wind === 0 || w.temp[i] < 80 || w.get(x, y - 1) !== M.Empty || !w.rng.chance(Math.abs(w.wind) * 0.02)) return false;
  w.transform(i, M.CandyFloss);
  return true;
}

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
  while (isCloud(w.get(x, top - 1))) top--;
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

/**
 * Earthworm: burrows through earth and loam, leaving loam behind; breeds when fed. When rain lies
 * on the ground above it, it comes up to the surface (as real worms do) and waits out the rain
 * there. Fallen into water, away from any soil, it drowns.
 */
export function updateWorm(w: World, x: number, y: number, i: number): boolean {
  const soil = neighbourOf(w, x, y, M.Earth, M.Loam) >= 0;
  if (w.rng.chance(0.00005) || (!soil && touches(w, x, y, M.Water) && w.rng.chance(0.01))) {
    w.transform(i, M.Earth);
    return true;
  }
  if (!soil) return false; // in the open: it falls
  // Out at the surface (rain brings worms up), it now and then draws a crow.
  if (w.rng.chance(BIRD_DRAW) && touches(w, x, y, M.Empty)) drawBird(w, x, y, M.Crow);
  // Ash lying on the soil beside it: it works it in as loam.
  if (w.rng.chance(0.02)) {
    const a = neighbourOf(w, x, y, M.Ash, M.Ash);
    if (a >= 0 && a + w.width < w.size && soaksAsh(w.mat[a + w.width] as MaterialId)) w.transform(a, M.Loam);
  }
  if (!w.rng.chance(0.3)) return true;
  if (rainAbove(w, x, y)) {
    // Rain: head up towards the surface, and stay there while the ground is wet.
    const above = w.get(x, y - 1);
    if (above === M.Earth || above === M.Loam) w.swap(i, w.idx(x, y - 1));
    return true;
  }
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

/** How deep a worm can be and still feel rain lying on the ground above it. */
const WORM_RAIN_DEPTH = 12;

/** Whether rain is lying on the ground straight above (x, y), through no more than WORM_RAIN_DEPTH cells of soil. */
function rainAbove(w: World, x: number, y: number): boolean {
  for (let k = 1; k <= WORM_RAIN_DEPTH; k++) {
    const t = w.get(x, y - k);
    if (t === M.Water) return true;
    if (t !== M.Earth && t !== M.Loam && t !== M.Earthworm) return false;
  }
  return false;
}

/**
 * Loam: after rain, in damp shade (the sun is down, or something shades it), now and then a
 * mushroom sprouts on its surface, never close beside another.
 */
export function sproutMushroom(w: World, x: number, y: number, _i: number): boolean {
  // (Open air above first: it rules out nearly every cell, buried ones, at once.)
  if (w.get(x, y - 1) !== M.Empty || !w.rng.chance(0.0004) || !w.near(x, y, 2, M.Water)) return false;
  if (w.inSunlight(x, y - 1) || w.near(x, y, 5, M.Mushroom)) return false;
  w.set(x, y - 1, M.Mushroom);
  return false;
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
  // Stunned by a blast (counted down in `vel`): it floats up, belly first, until it comes round.
  if (w.vel[i] > 0) {
    w.vel[i]--;
    const above = w.get(x, y - 1);
    if ((above === M.Water || above === M.SaltWater) && w.rng.chance(0.3)) w.swap(i, w.idx(x, y - 1));
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
  // Swimming near the surface of open water, it now and then draws a seagull down from the sky.
  if (w.rng.chance(BIRD_DRAW) && w.get(x, y - 1) === M.Empty) drawBird(w, x, y, M.Seagull);
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
  // In strong direct sun, a dry snail withdraws into its shell and waits for shade or rain.
  if (w.sun >= 1 && neighbourOf(w, x, y, M.Water, M.SaltWater) < 0 && w.inSunlight(x, y)) return true;
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

/**
 * Where a vent at (x, y) releases into: up through any pool of liquid or gas above it to the first
 * open cell (so a spring fills its own pond), otherwise open air beside it or diagonally above.
 * Returns the cell's index, or -1 if it's sealed in.
 */
function ventOutlet(w: World, x: number, y: number): number {
  for (let k = 1; k <= 8; k++) {
    const t = w.get(x, y - k);
    if (t === M.Empty) return w.idx(x, y - k);
    const kind = w.defAt(x, y - k).kind;
    if (kind !== 'liquid' && kind !== 'gas') break;
  }
  const d = w.rng.sign();
  for (let k = 0; k < 4; k++) {
    const nx = x + (k & 1 ? -d : d);
    const ny = k < 2 ? y - 1 : y;
    if (w.get(nx, ny) === M.Empty) return w.idx(nx, ny);
  }
  return -1;
}

/**
 * Vent (its `emits` entry says what, how often, how much): now and then releases a burst into open
 * air, counting its reservoir down in `life` (0 means freshly made: it fills up first), and dies into
 * its spent rock when that's empty. All vents together share a per-frame budget.
 */
export function vent(w: World, x: number, y: number, i: number): boolean {
  const e = w.defAt(x, y).emits;
  if (!e) return true;
  if (w.life[i] === 0) w.life[i] = e.reservoir + 1;
  if (w.life[i] <= 1) {
    w.transform(i, e.spent);
    return true;
  }
  if (!w.rng.chance(1 / e.every)) return true;
  const n0 = w.rng.int(e.burst[0], e.burst[1]);
  // A big eruption (a volcano, a gusher) thumps like a small blast.
  if (e.launch !== undefined && e.launch >= 3 && n0 >= 8) {
    w.noise.blasts++;
    if (w.noise.blastRadius < 4) w.noise.blastRadius = 4;
  }
  for (let n = n0; n > 0 && w.ventBudget > 0 && w.life[i] > 1; n--) {
    const t = ventOutlet(w, x, y);
    if (t < 0) break;
    const other = e.sometimes;
    w.setCell(t, other && w.rng.chance(other.chance) ? other.what : e.what);
    if (e.launch) w.launch(t, w.rng.next() - 0.5, -e.launch * (0.7 + w.rng.next() * 0.6));
    w.life[i]--;
    w.ventBudget--;
  }
  return true;
}

/**
 * Sinkhole: liquid that reaches it drains away underground, one cell at a time, from beside it or
 * anywhere in the funnel above it (up to two cells either side: liquid flowing across a flat floor
 * jumps to the far side of a gap, so a narrower funnel would be stepped over).
 */
export function swallow(w: World, x: number, y: number, _i: number): boolean {
  const k = w.rng.int(0, 6);
  const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x + k - 4;
  const ny = k < 2 ? y : y - 1;
  if (w.inBounds(nx, ny) && w.defAt(nx, ny).kind === 'liquid') w.setCell(w.idx(nx, ny), M.Empty);
  return true;
}

/**
 * Gravel: soaked with water (or salt water) under a stone lid, it's an aquifer under pressure, and now
 * and then the stone above becomes a spring (or a brine spring) where the water finds its way up.
 */
export function aquifer(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.002) || w.get(x, y - 1) !== M.Stone) return false;
  const wet = touches(w, x, y, M.Water) ? M.Spring : touches(w, x, y, M.SaltWater) ? M.BrineSpring : -1;
  if (wet >= 0) w.transform(w.idx(x, y - 1), wet as MaterialId);
  return false;
}

/** Is any of the four neighbours of (x, y) solid, for a crawling creature to hold on to? */
function hasGrip(w: World, x: number, y: number): boolean {
  return w.isSolid(x - 1, y) || w.isSolid(x + 1, y) || w.isSolid(x, y - 1) || w.isSolid(x, y + 1);
}

/**
 * Ant. Digs a grain of earth or sand from beside or below it, moving into the hole, carries it (the
 * grain is held in `vel`: 1 earth, 2 sand) up to open air, pushing up through loose soil if need be,
 * and drops it on the rim of its hole, so ants turn the ground over and pile up anthills. Eats sweet things (sugar, honeydew, fruit,
 * seeds), breeding when fed; drowns in water, or dies of old age, into earth.
 */
export function updateAnt(w: World, x: number, y: number, i: number): boolean {
  if (w.rng.chance(0.0001) || (touches(w, x, y, M.Water) && w.rng.chance(0.02))) {
    w.setCell(i, M.Earth);
    return true;
  }
  if (w.rng.chance(0.02)) {
    let food = neighbourOf(w, x, y, M.Sugar, M.Honeydew);
    if (food < 0) food = neighbourOf(w, x, y, M.Fruit, M.Seed);
    if (food >= 0) {
      w.setCell(food, M.Empty);
      if (++w.life[i] >= 3 && w.rng.chance(0.3)) {
        w.life[i] = 0;
        w.setCell(food, M.Ant);
      }
    }
  }
  if (!hasGrip(w, x, y)) {
    if (w.get(x, y + 1) === M.Empty) w.swap(i, w.idx(x, y + 1));
    return true;
  }
  if (!w.rng.chance(0.15)) return true;
  const carrying = w.vel[i];
  if (carrying === 0) {
    // Dig: a grain from beside or below (never the roof over its head).
    const k = w.rng.int(0, 2);
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y + 1 : y;
    const t = w.get(nx, ny);
    if ((t === M.Earth || t === M.Sand) && w.inBounds(nx, ny)) {
      const n = w.idx(nx, ny);
      w.setCell(n, M.Empty);
      w.swap(i, n);
      w.vel[n] = t === M.Earth ? 1 : 2;
      return true;
    }
  } else if (w.get(x, y - 1) === M.Empty && w.get(x, y - 2) === M.Empty) {
    // At the mouth of the tunnel: toss the grain a couple of cells away (any nearer and it rolls
    // straight back down the hole), so the grains pile up around the entrance into an anthill.
    const d = w.rng.sign();
    for (const tx of [x + 2 * d, x - 2 * d]) {
      if (w.get(tx, y - 1) === M.Empty && w.get(x + (tx - x) / 2, y - 1) === M.Empty) {
        w.set(tx, y - 1, carrying === 1 ? M.Earth : M.Sand);
        w.vel[i] = 0;
        return true;
      }
    }
  }
  // Walk to an open cell with something to hold on to; laden, it heads upward, pushing up through
  // loose earth or sand if it's buried (its tunnels in loose soil soon fall in behind it).
  const k = carrying !== 0 && w.rng.chance(0.5) ? 2 : w.rng.int(0, 3);
  const nx = dirX(k, x);
  const ny = dirY(k, y);
  const t = w.get(nx, ny);
  if (t === M.Empty && hasGrip(w, nx, ny)) w.swap(i, w.idx(nx, ny));
  else if (k === 2 && carrying !== 0 && (t === M.Earth || t === M.Sand) && w.inBounds(nx, ny)) w.swap(i, w.idx(nx, ny));
  return true;
}

/**
 * Yeast: lives in water, fermenting the sugar it touches into alcohol or carbon dioxide (which
 * bubbles up), multiplying while fed. With no sugar it slowly dies away, out of water it dries up,
 * and heat kills it: it leaves water behind.
 */
export function updateYeast(w: World, x: number, y: number, i: number): boolean {
  if (w.temp[i] > 60) {
    w.transform(i, M.Water);
    return true;
  }
  const sugar = neighbourOf(w, x, y, M.Sugar, M.Sugar);
  if (sugar >= 0) {
    if (w.rng.chance(0.02)) {
      w.transform(sugar, w.rng.chance(0.5) ? M.Alcohol : M.CarbonDioxide);
      if (++w.life[i] >= 3 && w.rng.chance(0.3)) {
        w.life[i] = 0;
        breed(w, i, M.Yeast, M.Water, M.Alcohol);
      }
    }
  } else if (w.rng.chance(touches(w, x, y, M.Water) || touches(w, x, y, M.Alcohol) ? 0.002 : 0.02)) {
    w.transform(i, M.Water);
    return true;
  }
  // It drifts, and slowly settles to the bottom (where the sugar is).
  const below = w.get(x, y + 1);
  if ((below === M.Water || below === M.Alcohol) && w.rng.chance(0.03)) w.swap(i, w.idx(x, y + 1));
  else if (w.rng.chance(0.1)) crawl(w, x, y, i, M.Water, M.Alcohol);
  return true;
}

/**
 * Coral polyp: fixed in salt water, it slowly turns the salt water beside it into coral rock (faster
 * when the water is warm, from 25°), now and then budding a new polyp on the reef instead. Over 40°
 * it bleaches; out of salt water it dies; either way it becomes coral rock.
 */
export function updateCoral(w: World, x: number, y: number, i: number): boolean {
  const t = w.temp[i];
  if (t > 40) {
    w.transform(i, M.CoralRock);
    return true;
  }
  if (!w.rng.chance(t >= 25 ? 0.006 : 0.002)) return true;
  const k = w.rng.int(0, 3);
  const nx = dirX(k, x);
  const ny = dirY(k, y);
  if (w.get(nx, ny) === M.SaltWater) {
    w.transform(w.idx(nx, ny), w.rng.chance(0.15) ? M.CoralPolyp : M.CoralRock);
  } else if (neighbourOf(w, x, y, M.SaltWater, M.SaltWater) < 0 && w.rng.chance(0.2)) {
    w.transform(i, M.CoralRock);
  }
  return true;
}

/** Pulse the conductors beside (x, y). */
function pulseAround(w: World, x: number, y: number): void {
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (w.inBounds(nx, ny)) w.electrify(w.idx(nx, ny));
  }
}

/** Pulses an accumulator can store. */
const ACCUMULATOR_MAX = 400;

/** After the last pulse arrives, an accumulator waits this many frames before paying out. */
const ACCUMULATOR_WAIT = 150;

/**
 * Accumulator: a rechargeable battery. Every pulse that arrives beside it is stored (in `life`).
 * While pulses keep arriving it just charges (`vel` counts down from the last one); once the supply
 * stops, it pays its store back out as a battery does. So a solar cell charges it by day, and it
 * keeps a circuit running once the sun has gone.
 */
export function accumulate(w: World, x: number, y: number, i: number): boolean {
  if (w.pulseBeside(x, y)) {
    if (w.life[i] < ACCUMULATOR_MAX) w.life[i]++;
    w.vel[i] = ACCUMULATOR_WAIT;
  } else if (w.vel[i] > 0) {
    w.vel[i]--;
  } else if (w.life[i] > 0 && w.rng.chance(0.02)) {
    pulseAround(w, x, y);
    w.life[i]--;
  }
  return true;
}

/**
 * Thermocouple: a copper-iron junction. While one side of it is much hotter than another (by 150°
 * or more), it sends pulses into touching conductors, more often the bigger the difference: a fire
 * can power a circuit.
 */
export function thermocouple(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.05)) return true;
  const t = w.temp;
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    if (!w.inBounds(nx, ny)) continue;
    const v = t[w.idx(nx, ny)];
    if (v > hi) hi = v;
    if (v < lo) lo = v;
  }
  const diff = hi - lo;
  if (diff >= 150 && w.rng.chance(Math.min(1, diff / 600) * 0.4)) pulseAround(w, x, y);
  return true;
}

/** How far down a heat lamp's beam reaches, and how hot it can make what it lands on. */
const LAMP_REACH = 150;
const LAMP_TEMP = 150;
/** The beam's half-width per cell travelled (about 8 degrees either side of straight down). */
const LAMP_SPREAD = 0.15;
/** Warmth a ray brings, and the distance at which that has halved. */
const LAMP_HEAT = 20;
const LAMP_FALLOFF = 60;

/**
 * Heat lamp: a carbon filament in glass. For a while after each pulse (`life` counts down: it glows
 * while lit) it shines down in a narrow cone: each frame one ray, at a random angle within it, so
 * over a few frames it warms a widening patch. The ray passes through anything see-through and warms
 * the first thing it reaches, less the further it has come, baking it as sunshine does (thawing,
 * drying, burning off cloud and fog), only harder close up.
 */
export function heatLamp(w: World, x: number, y: number, i: number): boolean {
  if (w.charge[i] !== 0) w.life[i] = 90;
  if (w.life[i] <= 0) return true;
  w.life[i]--;
  const slope = (w.rng.next() * 2 - 1) * LAMP_SPREAD;
  for (let k = 1; k <= LAMP_REACH; k++) {
    const ny = y + k;
    const nx = x + Math.round(slope * k);
    if (ny >= w.height || nx < 0 || nx >= w.width) break;
    const def = w.defAt(nx, ny);
    if (def.transparent ?? (def.kind === 'gas' || def.kind === 'empty')) continue;
    const n = w.idx(nx, ny);
    const strength = LAMP_FALLOFF / (LAMP_FALLOFF + k);
    if (w.temp[n] < LAMP_TEMP) w.temp[n] = Math.min(LAMP_TEMP, w.temp[n] + LAMP_HEAT * strength);
    const change = def.sunlit;
    if (change && w.rng.chance(change.chance * 4 * strength)) {
      const other = change.sometimes;
      w.transform(n, other && w.rng.chance(other.chance) ? other.into : change.into);
    }
    break;
  }
  return true;
}

/** Graphite: carrying a pulse while touching glass, it becomes a carbon-filament heat lamp. */
export function filament(w: World, x: number, y: number, i: number): boolean {
  if (w.charge[i] !== 0 && w.rng.chance(0.05) && touches(w, x, y, M.Glass)) w.transform(i, M.HeatLamp);
  return false;
}

/**
 * Fog: settling on ground that a clear night has chilled below freezing, it leaves its water there
 * as frost (rime). Otherwise it drifts as an ordinary gas.
 */
export function updateFog(w: World, x: number, y: number, i: number): boolean {
  if (y + 1 >= w.height || !w.rng.chance(0.05) || w.temp[i + w.width] >= 0 || !w.isSolid(x, y + 1)) return false;
  w.transform(i, M.Frost);
  return true;
}

/** Thin ice: while it's well below freezing, the water just under it freezes on, so the skin thickens slowly through a cold night. */
export function thickenIce(w: World, x: number, y: number, i: number): boolean {
  if (w.temp[i] > -4 || !w.rng.chance(0.004)) return true;
  if (w.get(x, y + 1) === M.Water && w.temp[w.idx(x, y + 1)] < 0) w.transform(w.idx(x, y + 1), M.ThinIce);
  return true;
}

// ---------------------------------------------------------------- birds

/** Chance per frame that a fish at the surface, or a worm out on the ground, draws a bird. */
const BIRD_DRAW = 0.0004;
/** A bird is only drawn if there isn't already one of its kind within this many cells. */
const BIRD_SPACING = 24;
/** Hunger is counted in `vel`, one a frame every 16 frames: a bird that hasn't eaten for this long (about a minute) dies. */
const BIRD_STARVE = 220;
/** How far a bird can spot its prey. */
const BIRD_SIGHT = 8;

/**
 * A fish or worm at (x, y) draws a bird of `kind`: it arrives in the open sky above, as long as
 * there's room up there and no other bird of its kind nearby.
 */
function drawBird(w: World, x: number, y: number, kind: MaterialId): void {
  if (w.near(x, y, BIRD_SPACING, kind)) return;
  let top = y - 1;
  while (top > 0 && y - top < 14 && w.get(x, top - 1) === M.Empty) top--;
  if (y - top < 6) return; // not enough open sky
  w.set(x, top, kind);
}

/** A bird grows hungrier; starved, it drops dead. Returns true if it died. */
function birdHunger(w: World, i: number): boolean {
  if (w.frame % 16 !== 0 || ++w.vel[i] < BIRD_STARVE) return false;
  w.transform(i, M.Compost);
  return true;
}

/** Whether a bird can fly into (x, y): open air, or for a diving gull, water. */
function birdCanEnter(w: World, x: number, y: number, water: boolean): boolean {
  const t = w.get(x, y);
  return t === M.Empty || (water && (t === M.Water || t === M.SaltWater));
}

/** Step bird i one cell towards (tx, ty), into a cell it can fly (or dive) through. */
function flyTowards(w: World, x: number, y: number, i: number, tx: number, ty: number, water: boolean): void {
  const dx = Math.sign(tx - x);
  const dy = Math.sign(ty - y);
  if ((dx !== 0 || dy !== 0) && birdCanEnter(w, x + dx, y + dy, water)) w.swap(i, w.idx(x + dx, y + dy));
  else if (dx !== 0 && birdCanEnter(w, x + dx, y, water)) w.swap(i, w.idx(x + dx, y));
  else if (dy !== 0 && birdCanEnter(w, x, y + dy, water)) w.swap(i, w.idx(x, y + dy));
}

/** Where spotPrey found its prey. */
let preyX = 0;
let preyY = 0;

/**
 * Look for the nearest cell of `prey` within BIRD_SIGHT (in squares of growing size); with
 * `inOpen`, only one out in the open (touching air). Found: true, with its place in preyX, preyY.
 */
function spotPrey(w: World, x: number, y: number, prey: MaterialId, inOpen: boolean): boolean {
  for (let r = 1; r <= BIRD_SIGHT; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (w.get(x + dx, y + dy) !== prey || (inOpen && !touches(w, x + dx, y + dy, M.Empty))) continue;
        preyX = x + dx;
        preyY = y + dy;
        return true;
      }
    }
  }
  return false;
}

/** A fed bird now and then raises another (in open air beside it). */
function birdBreeds(w: World, x: number, y: number, kind: MaterialId): void {
  if (!w.rng.chance(0.15)) return;
  const k = w.rng.int(0, 3);
  if (w.get(dirX(k, x), dirY(k, y)) === M.Empty) w.set(dirX(k, x), dirY(k, y), kind);
}

/**
 * Seagull: drawn by fish near the surface of open water. It wheels over water a little way up,
 * now and then floats on the surface, and dives for any fish it spots, eating it. Well fed it
 * raises another now and then; without fish it starves within a minute or so, falling as compost.
 */
export function updateSeagull(w: World, x: number, y: number, i: number): boolean {
  if (birdHunger(w, i)) return true;
  const above = w.get(x, y - 1);
  // Under water after a dive: swim back up.
  if (above === M.Water || above === M.SaltWater) {
    if (w.rng.chance(0.4)) w.swap(i, w.idx(x, y - 1));
    return true;
  }
  if (w.rng.chance(0.3)) {
    if (spotPrey(w, x, y, M.Fish, false)) {
      if (Math.abs(preyX - x) <= 1 && Math.abs(preyY - y) <= 1) {
        w.setCell(w.idx(preyX, preyY), M.Water);
        w.vel[i] = 0;
        birdBreeds(w, x, y, M.Seagull);
      } else {
        flyTowards(w, x, y, i, preyX, preyY, true);
      }
      return true;
    }
  }
  // How high above water (or anything) it is.
  let drop = 1;
  while (drop < 40 && w.get(x, y + drop) === M.Empty) drop++;
  const below = w.get(x, y + drop);
  const overWater = below === M.Water || below === M.SaltWater;
  // Floating on the water: mostly it bobs there, now and then it takes off.
  if (overWater && drop === 1 && !w.rng.chance(0.01)) return true;
  if (!w.rng.chance(0.5)) return true;
  // Wheel about: drift sideways, keeping 5-14 cells up over water (lower over land, looking for it).
  const nx = x + w.rng.sign();
  const want = overWater ? (drop < 5 ? -1 : drop > 14 ? 1 : w.rng.int(-1, 1)) : drop > 20 ? 1 : drop < 3 ? -1 : w.rng.int(-1, 1);
  flyTowards(w, x, y, i, nx, y + (overWater && drop === 1 && w.rng.chance(0.5) ? 1 : want), false);
  return true;
}

/**
 * Crow: drawn by earthworms out on the surface (rain brings them up). It flies low over the
 * ground, perches on anything solid for a while, and swoops on any worm it spots out in the open,
 * eating it. Well fed it raises another now and then; without worms it starves within a minute or
 * so, falling as compost.
 */
export function updateCrow(w: World, x: number, y: number, i: number): boolean {
  if (birdHunger(w, i)) return true;
  if (w.rng.chance(0.3)) {
    if (spotPrey(w, x, y, M.Earthworm, true)) {
      if (Math.abs(preyX - x) <= 1 && Math.abs(preyY - y) <= 1) {
        w.transform(w.idx(preyX, preyY), M.Loam);
        w.vel[i] = 0;
        birdBreeds(w, x, y, M.Crow);
      } else {
        flyTowards(w, x, y, i, preyX, preyY, false);
      }
      return true;
    }
  }
  // Perched on something solid: it mostly sits, now and then it flies off.
  if (w.isSolid(x, y + 1) && !w.rng.chance(0.01)) return true;
  if (!w.rng.chance(0.5)) return true;
  let drop = 1;
  while (drop < 30 && w.get(x, y + drop) === M.Empty) drop++;
  // Flap about, drifting down towards the ground (crows fly low, and land).
  const want = drop > 12 ? 1 : drop > 3 && w.rng.chance(0.3) ? 1 : w.rng.int(-1, 1);
  flyTowards(w, x, y, i, x + w.rng.sign(), y + want, false);
  return true;
}

/** A pine cone opens once it has been cool (under this temperature) for CONE_OPEN frames. */
const CONE_COOL = 60;
const CONE_OPEN = 240;

/**
 * Pine cone: sealed with resin, it rides out the fire. Once it has been cool for a few seconds (the
 * fire has passed), it opens into a seed, which can sprout in the ash around it. (Opening any
 * earlier, the seed would pop in the heat.) The time cool is counted in `life`.
 */
export function openCone(w: World, _x: number, _y: number, i: number): boolean {
  if (w.temp[i] >= CONE_COOL) w.life[i] = 0;
  else if (++w.life[i] >= CONE_OPEN) {
    // The seed it drops grows into a pine.
    w.setCell(i, M.Seed);
    w.life[i] = PINE_SEED;
    return true;
  }
  return false;
}

/** Pine needles: like leaves (buried under sand they turn to oil), and now and then one drops a cone into the open air below. */
export function updateNeedles(w: World, x: number, y: number, i: number): boolean {
  if (w.rng.chance(0.00001) && w.get(x, y + 1) === M.Empty) w.set(x, y + 1, M.PineCone);
  return fossilise(w, x, y, i);
}

// ---------------------------------------------------------------- anomalies
//
// Rare cells where one law of physics goes wrong. Each is a single static cell that reaches a few
// cells around it, sampling a handful of them a frame (so it costs little), breaks exactly one
// rule, and leaves the rest of the physics to react.

/** Pick a random cell within `r` of (x, y), not (x, y) itself: its index, or -1 (off the grid, or outside the circle). */
function within(w: World, x: number, y: number, r: number): number {
  const dx = w.rng.int(-r, r);
  const dy = w.rng.int(-r, r);
  if ((dx === 0 && dy === 0) || dx * dx + dy * dy > r * r || !w.inBounds(x + dx, y + dy)) return -1;
  return w.idx(x + dx, y + dy);
}

/** Can a loose cell (powder or liquid, not pinned) be moved by an anomaly? */
function loose(w: World, j: number): boolean {
  const kind = w.defAt(j % w.width, (j / w.width) | 0).kind;
  return (kind === 'powder' || kind === 'liquid') && w.pinned[j] === 0;
}

const COLD_SUN_REACH = 6;
/** The temperature a cold sun drags things towards. */
const COLD_SUN_TEMP = -60;

/**
 * Cold sun: heat flows into it instead of out. Everything within reach is chilled hard, so water
 * freezes and fire goes out, and it glows brighter the more heat it drinks (its brightness, in
 * `shade`, follows the heat stored in `life`, which slowly fades).
 */
export function coldSun(w: World, x: number, y: number, i: number): boolean {
  let drunk = 0;
  for (let k = 0; k < 10; k++) {
    const j = within(w, x, y, COLD_SUN_REACH);
    if (j < 0) continue;
    const t = w.temp[j];
    if (t > COLD_SUN_TEMP) {
      const take = (t - COLD_SUN_TEMP) * 0.35;
      w.temp[j] = t - take;
      drunk += take;
    }
    if (w.burn[j] > 0) w.burn[j] = 0;
    const m = w.mat[j];
    if (m === M.Fire) w.setCell(j, M.Smoke);
    // Water freezes (to thin ice, which thaws again away from the cold, so a cold sun can't lock a
    // whole sea in spreading ice).
    else if (m === M.Water && w.temp[j] < 0) w.transform(j, M.ThinIce);
  }
  w.life[i] = Math.min(4000, Math.max(0, w.life[i] - 6 + drunk * 0.2));
  w.shade[i] = Math.min(15, w.life[i] >> 8);
  return true;
}

const LIFT_REACH = 6;

/**
 * Lift field: gravity runs backwards around it. Loose grains and drops within reach are thrown
 * upwards, so sand and water fountain up out of it and rain down outside.
 */
export function liftField(w: World, x: number, y: number, _i: number): boolean {
  for (let k = 0; k < 14; k++) {
    const j = within(w, x, y, LIFT_REACH);
    if (j < 0 || !loose(w, j)) continue;
    w.launch(j, (w.rng.next() - 0.5) * 0.8, -(1.4 + w.rng.next() * 1.4));
  }
  return true;
}

const KNOT_REACH = 8;

/** What a gravity knot crushes its neighbours into. */
function crushed(t: MaterialId): MaterialId | -1 {
  switch (t) {
    case M.Sand:
    case M.Gravel:
    case M.Earth:
    case M.Ash:
      return M.Stone;
    case M.Coal:
    case M.Charcoal:
    case M.Graphite:
      return M.Diamond;
    case M.Snow:
      return M.Ice;
    case M.Clay:
      return M.Brick;
    default:
      return -1;
  }
}

/**
 * Gravity knot: gravity pulls towards it, from every side. Loose grains and drops within reach are
 * drawn a step closer, and whatever it holds against itself is crushed: sand and earth into stone,
 * coal into diamond, snow into ice.
 */
export function gravityKnot(w: World, x: number, y: number, _i: number): boolean {
  // Every loose cell within reach, every frame, so the pull holds them against ordinary gravity.
  const r = KNOT_REACH;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 === 0 || d2 > r * r) continue;
      const jx = x + dx;
      const jy = y + dy;
      if (!w.inBounds(jx, jy)) continue;
      const j = w.idx(jx, jy);
      if (!loose(w, j)) continue;
      // Caught by the knot, it stops falling (and flying) the ordinary way.
      w.vel[j] = 0;
      w.vx[j] = 0;
      w.vy[j] = 0;
      // Cells below have already fallen this frame (the grid updates bottom-up): two steps up for them.
      const at = pullStep(w, j, jx, jy, x, y);
      if (dy > 0 && at >= 0) pullStep(w, at, at % w.width, (at - (at % w.width)) / w.width, x, y);
    }
  }
  // Whatever it holds against itself is crushed.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx === 0 && dy === 0) || !w.rng.chance(0.01)) continue;
      const into = crushed(w.get(x + dx, y + dy));
      if (into !== -1) w.transform(w.idx(x + dx, y + dy), into);
    }
  }
  return true;
}

/**
 * One step of cell j at (jx, jy) towards the knot at (kx, ky): diagonally if it can, otherwise along
 * the longer way, then the other. Returns where it went, or -1 if it couldn't move.
 */
function pullStep(w: World, j: number, jx: number, jy: number, kx: number, ky: number): number {
  const sx = Math.sign(kx - jx);
  const sy = Math.sign(ky - jy);
  if (pullTo(w, j, jx + sx, jy + sy, kx, ky)) return w.idx(jx + sx, jy + sy);
  const first = Math.abs(kx - jx) >= Math.abs(ky - jy);
  for (let k = 0; k < 2; k++) {
    const horizontal = (k === 0) === first;
    const tx = horizontal ? jx + sx : jx;
    const ty = horizontal ? jy : jy + sy;
    if ((tx !== jx || ty !== jy) && pullTo(w, j, tx, ty, kx, ky)) return w.idx(tx, ty);
  }
  return -1;
}

/** Move cell j to (tx, ty) if that's open (air or gas) and isn't the knot at (kx, ky). */
function pullTo(w: World, j: number, tx: number, ty: number, kx: number, ky: number): boolean {
  if ((tx === kx && ty === ky) || !w.inBounds(tx, ty)) return false;
  const t = w.get(tx, ty);
  if (t !== M.Empty && w.defAt(tx, ty).kind !== 'gas') return false;
  w.swap(j, w.idx(tx, ty));
  return true;
}

/** Stasis pocket: registers itself each frame; the world then updates cells within reach only now and then (see World.holdStasis). */
export function stasisPocket(w: World, x: number, y: number, _i: number): boolean {
  w.holdStasis(x, y);
  return true;
}

const ARC_REACH = 7;

/**
 * Arc node: insulation fails around it. Every so often it throws an arc of lightning to something
 * within reach, conductor or not: through the air to the first thing in the way, which it lights,
 * sparks or scorches.
 */
export function arcNode(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.04)) return true;
  const j = within(w, x, y, ARC_REACH);
  // Only at something: it doesn't throw arcs into empty air.
  if (j < 0 || w.mat[j] === M.Empty || w.defAt(j % w.width, (j / w.width) | 0).kind === 'gas') return true;
  const tx = j % w.width;
  const ty = (j - tx) / w.width;
  const steps = Math.max(Math.abs(tx - x), Math.abs(ty - y));
  for (let s = 1; s <= steps; s++) {
    const px = Math.round(x + ((tx - x) * s) / steps);
    const py = Math.round(y + ((ty - y) * s) / steps);
    const t = w.get(px, py);
    if (t === M.Empty || (w.defAt(px, py).kind === 'gas' && t !== M.Lightning)) {
      w.setCell(w.idx(px, py), M.Lightning);
      continue;
    }
    if (t === M.Lightning) continue;
    // The first thing in the way takes the arc.
    const n = w.idx(px, py);
    if (!w.electrify(n)) {
      if (w.defAt(px, py).flammability > 0) w.ignite(n);
      else w.temp[n] += 300;
    }
    break;
  }
  return true;
}

const FAULT_REACH = 5;

/**
 * Phase fault: phase changes come loose around it. Things within reach are shifted one state up,
 * as if heated past their change (ice to water, water to steam, metal to molten metal), but only
 * just past it, so a little way off, cooling, they change back.
 */
export function phaseFault(w: World, x: number, y: number, _i: number): boolean {
  for (let k = 0; k < 4; k++) {
    const j = within(w, x, y, FAULT_REACH);
    if (j < 0 || w.burn[j] > 0) continue;
    const above = w.defAt(j % w.width, (j / w.width) | 0).above;
    if (!above) continue;
    w.transform(j, above.into);
    w.temp[j] = above.temp + 5;
  }
  return true;
}

/**
 * Linked gates: distance comes loose between them. A grain or drop falling into one (resting on it)
 * comes out of another gate, below it; a wisp of gas rising into one, out of the top of another.
 * Every gate is linked to every other (they register with the world each frame: World.holdGate).
 */
export function linkedGate(w: World, x: number, y: number, i: number): boolean {
  w.holdGate(i);
  const count = w.gateCount;
  if (count < 2) return true;
  // What's falling in from above, or rising in from below?
  let src = -1;
  let up = false;
  if (y > 0 && loose(w, i - w.width)) src = i - w.width;
  else if (y < w.height - 1 && w.defAt(x, y + 1).kind === 'gas') {
    src = i + w.width;
    up = true;
  }
  if (src < 0) return true;
  const g = w.gateAt(w.rng.int(0, count - 1));
  if (g === i || w.mat[g] !== M.LinkedGate) return true;
  const gx = g % w.width;
  const gy = (g - gx) / w.width;
  const ty = up ? gy - 1 : gy + 1;
  for (const dx of [0, -1, 1]) {
    const tx = gx + dx;
    const t = w.get(tx, dx === 0 ? ty : gy);
    if (t === M.Empty) {
      w.swap(src, w.idx(tx, dx === 0 ? ty : gy));
      return true;
    }
  }
  return true;
}

/** One step along the transmuter's chains: base metal towards gold, carbon towards diamond, rock towards quartz. */
function transmuted(t: MaterialId): MaterialId | -1 {
  switch (t) {
    case M.Rust:
      return M.Iron;
    case M.Iron:
      return M.Copper;
    case M.Copper:
      return M.Gold;
    case M.Coal:
    case M.Charcoal:
      return M.Graphite;
    case M.Graphite:
      return M.Diamond;
    case M.Sand:
    case M.Stone:
      return M.Quartz;
    default:
      return -1;
  }
}

/**
 * Transmuter: conservation comes loose. Now and then it turns a neighbour one step along a chain
 * (rust to iron to copper to gold, coal to graphite to diamond, sand or stone to quartz), until it
 * burns out (its lifetime) into slag.
 */
export function transmuter(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.03)) return true;
  const k = w.rng.int(0, 3);
  const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
  const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
  const into = transmuted(w.get(nx, ny));
  if (into !== -1) w.transform(w.idx(nx, ny), into);
  return true;
}
