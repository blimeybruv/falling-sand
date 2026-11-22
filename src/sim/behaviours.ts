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

/** With the sun out, a plant in shade grows at this fraction of its old pace (in sun, up to twice). */
const SHADE_GROWTH = 0.35;

/**
 * Whether a plant at (x, y) grows this frame, `base` being its chance with no sun. With the sun
 * out it grows faster in sunlight (up to twice as often in full sun) and slower in shade; with
 * `shadeLoving` (moss) the other way round. The sunlight check only runs once the roll succeeds.
 */
function thrives(w: World, x: number, y: number, base: number, shadeLoving = false): boolean {
  const sun = w.sun;
  if (sun === 0) return w.rng.chance(base);
  if (!w.rng.chance(base * (1 + sun))) return false;
  return w.inSunlight(x, y) !== shadeLoving || w.rng.chance(SHADE_GROWTH / (1 + sun));
}

/** Grass: now and then spreads into neighbouring water, or over neighbouring open ground (see below). */
export function growGrass(w: World, x: number, y: number, _i: number): boolean {
  // Fed by fertiliser beside or beneath it, grass spreads twice as fast.
  if (!thrives(w, x, y, 0.03) && !(thrives(w, x, y, 0.03) && touches(w, x, y, M.Fertiliser))) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  const t = w.get(nx, ny);
  if (t === M.Water) {
    // Weeds that reach the surface spread across it as algae.
    w.set(nx, ny, w.get(nx, ny - 1) === M.Empty ? M.Algae : M.Grass);
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
/** A seed heated past this pops into popcorn. */
const POP_TEMP = 180;
/** Ground with no water this near counts as desert. */
const DRY_RANGE = 10;

export function updateSeed(w: World, x: number, y: number, i: number): boolean {
  const height = w.life[i];
  if (height >= BAMBOO_TIP) return growBamboo(w, x, y, i, height - BAMBOO_TIP);
  if (height >= CACTUS_TIP) return growCactus(w, x, y, i, height - CACTUS_TIP);
  if (height > 0) return growTree(w, x, y, i, height);
  // Heated past 180° (short of catching fire at 220°), a seed pops.
  if (w.temp[i] > POP_TEMP) {
    w.transform(i, M.Popcorn);
    w.launch(i, w.rng.next() * 2 - 1, -2 - w.rng.next() * 1.5);
    w.noise.pops++;
    return true;
  }
  if (!thrives(w, x, y, 0.02)) return false;
  if (w.get(x, y - 1) !== M.Empty) return false;
  const below = w.get(x, y + 1);
  if (below === M.Loam) {
    // Right beside water, loam grows bamboo; otherwise a flowering tree.
    w.life[i] = w.near(x, y, 2, M.Water) ? BAMBOO_TIP + w.rng.int(20, 40) : w.rng.int(28, 46) + LOAM_TREE;
    return true;
  }
  // On fertiliser, or damp ground, it grows into a tree.
  if (below === M.Fertiliser || ((below === M.Sand || below === M.Earth || below === M.Grass) && w.near(x, y, DAMP_RANGE, M.Water))) {
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
  if (!thrives(w, x, y, 0.5)) return true;
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

function growTree(w: World, x: number, y: number, i: number, tip: number): boolean {
  if (!thrives(w, x, y, 0.2)) return true; // grows slowly, and stays put while it does
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

/** Frames of charge building (corona) between a cloud deciding to strike and the bolt. */
const STRIKE_CHARGE: readonly [number, number] = [40, 70];

export function rainCloud(w: World, x: number, y: number, i: number): boolean {
  // Deep inside a thick cloud, very rarely, lightning: first the charge builds for a second or so
  // (the corona crackle you can hear before a close strike), counted down in `vel`, then it strikes.
  const charging = w.vel[i];
  if (charging > 0) {
    w.noise.corona++;
    w.vel[i] = charging - 1;
    if (charging === 1) strike(w, x, y);
  } else if (w.rng.chance(0.00002) && countAround(w, x, y, M.Cloud, M.Cloud) >= 6) {
    w.vel[i] = w.rng.int(STRIKE_CHARGE[0], STRIKE_CHARGE[1]);
  }
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
      if (def.id === M.Cloud || def.kind === 'empty' || def.kind === 'gas') continue;
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
    if (def.id === M.Cloud) continue;
    if (def.kind === 'empty' || def.kind === 'gas') {
      w.set(bx, by, M.Lightning);
      continue;
    }
    // Straight through the falling rain (and any water lying on the rod it's heading for).
    if (def.kind === 'liquid' && (w.vel[w.idx(bx, by)] > 0 || bx === rod)) continue;
    if (w.inBounds(bx, by)) {
      const n = w.idx(bx, by);
      if (def.id === M.Sand) fuseSand(w, bx, by);
      else if (!w.electrify(n)) w.ignite(n);
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

/**
 * Heat lamp: a carbon filament in glass. For a while after each pulse it shines straight down,
 * through anything see-through, warming the first thing it reaches and baking it as sunshine does
 * (thawing, drying, burning off cloud and fog), only harder.
 */
export function heatLamp(w: World, x: number, y: number, i: number): boolean {
  if (w.charge[i] !== 0) w.life[i] = 90;
  if (w.life[i] <= 0) return true;
  w.life[i]--;
  for (let ny = y + 1; ny < w.height && ny <= y + LAMP_REACH; ny++) {
    const def = w.defAt(x, ny);
    if (def.transparent ?? (def.kind === 'gas' || def.kind === 'empty')) continue;
    const n = w.idx(x, ny);
    if (w.temp[n] < LAMP_TEMP) w.temp[n] = Math.min(LAMP_TEMP, w.temp[n] + 4);
    const change = def.sunlit;
    if (change && w.rng.chance(change.chance * 4)) {
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

