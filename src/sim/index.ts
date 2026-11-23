/** Public surface of the simulation. render/ and ui/ import from here. */
export { M, type MaterialId } from './ids';
export {
  MATERIALS,
  PALETTE,
  MAX_BLAST_RADIUS,
  MAX_EXPLOSIONS_PER_FRAME,
  AMBIENT_TEMP,
  CATEGORIES,
  type Category,
  type MaterialDef,
  type Kind,
} from './materials';
export { World, SHADES, SUB, CHARGE_ACTIVE, sunAt, gustAt } from './world';
export { captureScene, encodeScene, decodeScene, applyScene, type Scene } from './scene';
export { Rng } from './rng';
export { Discovery, RECIPES, REWARD, STARTERS, type Recipe } from './discovery';
export { rasterShape, type Shape } from './shapes';
export { EXAMPLES, type Example } from './examples';
