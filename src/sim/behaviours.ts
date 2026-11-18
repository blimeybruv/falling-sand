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
