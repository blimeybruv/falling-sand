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
import { corrode, freezeWater, growPlant, updateFire, updateLava, updateSteam } from './behaviours';
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
  /** Cannot be destroyed by explosions, fire or acid. (The eraser still clears it.) */
  indestructible: boolean;
  /**
   * Explodes when it finishes burning (or, with no burnTime, after a short fuse once lit).
   * `impactSpeed`: frames of falling before a hard landing sets it off (omit: not impact-sensitive).
   * `chance`: probability of exploding when it burns out (omit: always); otherwise it becomes `burnsInto`.
   */
  explosive?: { radius: number; impactSpeed?: number; chance?: number };

  // ---- temperature (see World.updateTemperature). Ambient is AMBIENT_TEMP (20).
  /** 0..0.25: how quickly a cell takes on its neighbours' average temperature. */
  conductivity: number;
  /** 0..1: how quickly it drifts back to ambient temperature when nothing heats it. */
  cooling: number;
  /** Heat source or sink: holds itself towards `temp` at `rate` (0..1) per frame. Replaces `cooling`. */
  heat?: { temp: number; rate: number };
  /** Turns into `into` (keeping its temperature) once hotter than `temp`. */
  above?: { temp: number; into: MaterialId };
  /** Flammable materials catch fire once this hot, as well as from touching fire. */
  ignitesAt?: number;

  // ---- other
  /** 0..1: how strongly wind pushes it sideways. */
  wind: number;
  /** Renderer: the colour shimmers over time (lava). */
  glow?: boolean;
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
  conductivity: 0.05,
  cooling: 0.003,
  wind: 0,
};

const defs: Record<MaterialId, Def> = {
  [M.Empty]: {
    ...base,
    name: 'Empty',
    conductivity: 0.04,
    cooling: 0.02,
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
    conductivity: 0.06,
    wind: 0.1,
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
    conductivity: 0.12,
    above: { temp: 100, into: M.Steam },
    wind: 0.05,
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
    conductivity: 0.25,
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
    conductivity: 0.03,
    ignitesAt: 260,
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
    ignitesAt: 220,
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
    conductivity: 0.06,
    ignitesAt: 200,
    wind: 0.05,
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
    heat: { temp: 700, rate: 1 },
    wind: 0.5,
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
    ignitesAt: 180,
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
    ignitesAt: 140,
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
    wind: 0.7,
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
    wind: 0.6,
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
  [M.Acid]: {
    ...base,
    name: 'Acid',
    key: 'a',
    kind: 'liquid',
    density: 11,
    colour: [140, 235, 60],
    colourJitter: 0.1,
    dispersion: 3,
    conductivity: 0.1,
    wind: 0.05,
    update: corrode,
    description: 'Liquid; dissolves what it touches (not stone or water), using itself up.',
  },
  [M.Lava]: {
    ...base,
    name: 'Lava',
    key: 'l',
    kind: 'liquid',
    density: 15,
    colour: [255, 170, 50],
    colourEnd: [200, 45, 15],
    colourJitter: 0.06,
    dispersion: 1,
    viscosity: 0.8,
    conductivity: 0.1,
    heat: { temp: 1100, rate: 0.15 },
    glow: true,
    update: updateLava,
    description: 'Slow, glowing liquid; sets things alight, boils water and cools to stone where they meet.',
  },
  [M.Ice]: {
    ...base,
    name: 'Ice',
    key: 'i',
    kind: 'static',
    density: 100,
    colour: [170, 215, 245],
    colourJitter: 0.08,
    conductivity: 0.1,
    heat: { temp: -20, rate: 0.1 },
    above: { temp: 2, into: M.Water },
    update: freezeWater,
    description: 'Static; melts near heat and slowly freezes neighbouring water.',
  },
  [M.Gunpowder]: {
    ...base,
    name: 'Gunpowder',
    key: 'g',
    kind: 'powder',
    density: 18,
    colour: [62, 62, 68],
    colourJitter: 0.3,
    flammability: 0.9,
    burnTime: [2, 5],
    extinguishChance: 0.8,
    ignitesAt: 150,
    explosive: { radius: 3, chance: 0.2 },
    wind: 0.12,
    description: 'Powder; burns very fast with small blasts, so it can be laid as a fuse.',
  },
};

/** Indexed by material id. */
export const MATERIALS: readonly MaterialDef[] = Object.values(M).map((id) => ({ id, ...defs[id] }));

/** Palette order (also the order of the number-key shortcuts). */
export const PALETTE: readonly MaterialDef[] = [
  M.Sand, M.Water, M.Stone, M.Wood, M.Plant, M.Oil, M.Fire, M.Napalm, M.Nitro, M.Smoke, M.Steam,
  M.Acid, M.Lava, M.Ice, M.Gunpowder,
].map((id) => MATERIALS[id]);

/** Room temperature. Cells drift back towards it when nothing heats or cools them. */
export const AMBIENT_TEMP = 20;
/** Burning cells hold themselves towards this temperature. */
export const BURNING_TEMP = 500;

/** Explosions never exceed this radius, so a chain of nitroglycerin can't freeze the page. */
export const MAX_BLAST_RADIUS = 12;
/** At most this many explosions are processed per frame; the rest wait for the next frame. */
export const MAX_EXPLOSIONS_PER_FRAME = 16;
