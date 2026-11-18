/**
 * Small per-material functions, referenced from the `update` field in materials.ts.
 * Each runs once per frame for each cell of its material, before the generic movement for its kind.
 * Return true if the cell was fully handled this frame (moved, transformed or removed).
 *
 * Only `import type` from world.ts here, so there is no runtime import cycle.
 */
import { M } from './ids';
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

/** Steam: condenses back into water near the top of the grid, or under a solid ceiling. */
export function updateSteam(w: World, x: number, y: number, i: number): boolean {
  const nearTop = y < w.height * 0.1;
  if ((nearTop && w.rng.chance(0.01)) || (w.isSolid(x, y - 1) && w.rng.chance(0.004))) {
    w.setCell(i, M.Water);
    return true;
  }
  return false;
}

/** Plant: now and then, grows into a neighbouring water cell. */
export function growPlant(w: World, x: number, y: number, _i: number): boolean {
  if (!w.rng.chance(0.03)) return true;
  const nx = x + w.rng.int(-1, 1);
  const ny = y + w.rng.int(-1, 1);
  if (w.get(nx, ny) === M.Water) w.set(nx, ny, M.Plant);
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

/** Lava: sets neighbours alight, and where it meets water the water boils and the lava sets to stone. */
export function updateLava(w: World, x: number, y: number, i: number): boolean {
  w.igniteNeighbours(x, y);
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
    const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
    const n = w.get(nx, ny);
    if (n === M.Water) {
      if (w.rng.chance(0.5)) w.transform(w.idx(nx, ny), M.Steam);
      if (w.rng.chance(0.2)) {
        w.transform(i, M.Stone);
        return true;
      }
    } else if (n === M.Ice) {
      w.transform(w.idx(nx, ny), M.Water);
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
