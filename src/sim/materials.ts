/**
 * The material table: every material's behaviour is data in this one file.
 *
 * To add a material:
 *   1. Append an id to `M` in ids.ts.
 *   2. Add an entry to MATERIALS below (keyed by that id).
 *   3. If the generic movement/burning rules are not enough, write one small function in
 *      behaviours.ts and reference it as `update`.
 * Add the id to PALETTE (bottom of this file) to make it drawable. Renderer colours, palette
 * buttons and the keyboard shortcut all come from the table entry.
 */
import { M, type MaterialId } from './ids';
import { growPlant, updateFire, updateSteam } from './behaviours';
import type { World } from './world';

/**
 * How the generic engine moves a material.
 * - empty:  air. Never updated.
 * - static: never moves (stone, wood, plant).
 * - powder: falls, slides off diagonally, sinks through lighter liquids.
 * - liquid: falls, then spreads sideways; denser liquids sink through lighter ones.
 * - gas:    rises and drifts; usually has a lifetime.
 */
export type Kind = 'empty' | 'static' | 'powder' | 'liquid' | 'gas';

/** Per-material hook. Return true if the cell was fully handled (moved, transformed or removed). */
export type UpdateFn = (world: World, x: number, y: number, i: number) => boolean;

export interface MaterialDef {
  id: MaterialId;
  name: string;
  /** Keyboard shortcut shown in the palette ('' for none). */
  key: string;
  kind: Kind;
  /**
   * Relative density. A moving particle may swap with a liquid, gas or empty cell that is
   * lighter (moving down) or heavier (moving up). Air (Empty) is 1.
   */
  density: number;
  /** Base colour, 0-255 per channel. */
  colour: readonly [number, number, number];
  /** Optional second colour: particle shades blend between `colour` and this (e.g. fire). */
  colourEnd?: readonly [number, number, number];
  /** Brightness variation per particle, 0..1, so piles look textured. */
  colourJitter: number;
  /** Chance per frame, per burning neighbour, of catching fire. 0 = never burns. */
  flammability: number;
  /** Frames a burning cell keeps burning [min, max]. */
  burnTime: readonly [number, number];
  /** Chance per frame that touching water puts this material out while it burns. */
  extinguishChance: number;
  /** What a burning cell becomes once its burn time runs out. */
  burnsInto: MaterialId;
  /** Lifetime in frames [min, max] for short-lived materials (gas, fire). Omit for permanent ones. */
  lifetime?: readonly [number, number];
  /** What a short-lived cell becomes when its lifetime ends (Empty unless set), and how often. */
  decay?: { into: MaterialId; chance: number };
  /** Liquids: how many cells sideways it can flow per frame. */
  dispersion: number;
  /** Liquids: chance per frame of skipping sideways/diagonal flow (stickiness). 0 = runny. */
  viscosity: number;
  /** Gases: chance per frame of trying to rise straight up (otherwise it drifts). */
  rise: number;
  /** Cannot be destroyed by explosions or the brush's material swap. */
  indestructible: boolean;
  /** Explodes instead of burning. `impactSpeed`: falling frames before a hard landing detonates it. */
  explosive?: { radius: number; impactSpeed: number };
  /** Optional extra behaviour; runs before the generic movement for its kind. */
  update?: UpdateFn;
  /** One line for the palette tooltip and the README. */
  description: string;
}

type Def = Omit<MaterialDef, 'id'>;

/** Defaults shared by every entry; each entry overrides what it needs. */
const base: Omit<Def, 'name' | 'key' | 'kind' | 'density' | 'colour' | 'description'> = {
  colourJitter: 0.1,
  flammability: 0,
  burnTime: [0, 0],
  extinguishChance: 1,
  burnsInto: M.Fire,
  dispersion: 0,
  viscosity: 0,
  rise: 0,
  indestructible: false,
};

const defs: Record<MaterialId, Def> = {
  [M.Empty]: {
    ...base,
    name: 'Empty',
    key: '',
    kind: 'empty',
    density: 1,
    colour: [14, 15, 20],
    colourJitter: 0,
    description: 'Air.',
  },
  [M.Sand]: {
    ...base,
    name: 'Sand',
    key: '1',
    kind: 'powder',
    density: 20,
    colour: [219, 189, 120],
    colourJitter: 0.14,
    description: 'Falls, piles up, sinks through water.',
  },
  [M.Water]: {
    ...base,
    name: 'Water',
    key: '2',
    kind: 'liquid',
    density: 10,
    colour: [45, 110, 220],
    colourJitter: 0.06,
    dispersion: 5,
    description: 'Falls and spreads; puts out fire, turning it to steam.',
  },
  [M.Stone]: {
    ...base,
    name: 'Stone',
    key: '3',
    kind: 'static',
    density: 100,
    colour: [120, 120, 128],
    colourJitter: 0.16,
    indestructible: true,
    description: 'Static and indestructible.',
  },
  [M.Wood]: {
    ...base,
    name: 'Wood',
    key: '4',
    kind: 'static',
    density: 100,
    colour: [122, 78, 42],
    colourJitter: 0.14,
    flammability: 0.03,
    burnTime: [90, 180],
    extinguishChance: 0.5,
    description: 'Static; burns slowly.',
  },
  [M.Plant]: {
    ...base,
    name: 'Plant',
    key: '5',
    kind: 'static',
    density: 100,
    colour: [60, 170, 70],
    colourJitter: 0.18,
    flammability: 0.06,
    burnTime: [25, 50],
    extinguishChance: 0.5,
    update: growPlant,
    description: 'Static; slowly grows into neighbouring water; burns.',
  },
  [M.Oil]: {
    ...base,
    name: 'Oil',
    key: '6',
    kind: 'liquid',
    density: 8,
    colour: [92, 66, 40],
    colourJitter: 0.08,
    dispersion: 4,
    flammability: 0.35,
    burnTime: [12, 30],
    extinguishChance: 0.1,
    description: 'Liquid, floats on water; burns fast.',
  },
  [M.Fire]: {
    ...base,
    name: 'Fire',
    key: '7',
    kind: 'gas',
    density: 0.1,
    colour: [255, 214, 90],
    colourEnd: [225, 55, 15],
    colourJitter: 0.08,
    lifetime: [10, 26],
    decay: { into: M.Smoke, chance: 0.35 },
    rise: 0.45,
    update: updateFire,
    description: 'Short-lived; rises and flickers; ignites flammable neighbours.',
  },
  [M.Napalm]: {
    ...base,
    name: 'Napalm',
    key: '8',
    kind: 'liquid',
    density: 9,
    colour: [196, 72, 128],
    colourJitter: 0.1,
    dispersion: 1,
    viscosity: 0.85,
    flammability: 0.3,
    burnTime: [600, 900],
    extinguishChance: 0.01,
    burnsInto: M.Smoke,
    description: 'Sticky, slow liquid; burns for a long time and is hard to put out.',
  },
  [M.Nitro]: {
    ...base,
    name: 'Nitroglycerin',
    key: '9',
    kind: 'liquid',
    density: 13,
    colour: [200, 220, 140],
    colourJitter: 0.06,
    dispersion: 2,
    flammability: 0.6,
    explosive: { radius: 8, impactSpeed: 10 },
    description: 'Liquid; explodes on fire, or when it falls hard onto something.',
  },
  [M.Smoke]: {
    ...base,
    name: 'Smoke',
    key: '0',
    kind: 'gas',
    density: 0.3,
    colour: [90, 90, 96],
    colourJitter: 0.12,
    lifetime: [80, 200],
    rise: 0.35,
    description: 'Rises and drifts, then fades.',
  },
  [M.Steam]: {
    ...base,
    name: 'Steam',
    key: '-',
    kind: 'gas',
    density: 0.2,
    colour: [200, 210, 225],
    colourJitter: 0.06,
    lifetime: [150, 300],
    decay: { into: M.Water, chance: 0.3 },
    rise: 0.6,
    update: updateSteam,
    description: 'Rises; may condense back to water near the top.',
  },
};

/** Indexed by material id. */
export const MATERIALS: readonly MaterialDef[] = Object.values(M).map((id) => ({ id, ...defs[id] }));

/** Palette order (also the order of the number-key shortcuts). */
export const PALETTE: readonly MaterialDef[] = [
  M.Sand, M.Water, M.Stone, M.Wood, M.Plant, M.Oil, M.Fire, M.Napalm, M.Nitro, M.Smoke, M.Steam,
].map((id) => MATERIALS[id]);

/** Explosions never exceed this radius, so a chain of nitroglycerin can't freeze the page. */
export const MAX_BLAST_RADIUS = 12;
/** At most this many explosions are processed per frame; the rest wait for the next frame. */
export const MAX_EXPLOSIONS_PER_FRAME = 16;
