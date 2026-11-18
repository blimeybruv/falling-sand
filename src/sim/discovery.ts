/**
 * Discovery mode: players start with a few materials and unlock the rest by making them happen in
 * the simulation (fire meets water: steam). Pure logic, so it can be tested; the UI saves progress
 * and shows the results.
 *
 * A material is discovered when World.created shows the simulation has made at least one cell of
 * it. Painting with the brush or loading a scene doesn't count.
 *
 * To make a new material discoverable, give it a way to be created in the sim (usually a Reaction
 * in materials.ts) and add an entry to RECIPES with a hint. The "every material can be discovered"
 * test fails until you do.
 */
import { M, type MaterialId } from './ids';
import { PALETTE } from './materials';

export interface Recipe {
  /** Shown before discovery: a nudge, not the answer. */
  hint: string;
  /** Shown in the journal once discovered. */
  recipe: string;
}

/** Unlocked from the start. */
export const STARTERS: readonly MaterialId[] = [M.Sand, M.Earth, M.Water, M.Fire, M.Stone, M.Seed];

export const RECIPES: Readonly<Partial<Record<MaterialId, Recipe>>> = {
  [M.Smoke]: { hint: 'Everything that burns leaves something behind.', recipe: 'Let a fire burn out.' },
  [M.Steam]: { hint: 'Something hot meets something wet.', recipe: 'Fire meets water.' },
  [M.Wood]: {
    hint: 'Plant something where the ground is damp, or rich.',
    recipe: 'Drop a seed on loam, or on sand near water, and it grows into a tree.',
  },
  [M.Mud]: { hint: 'Wet the earth.', recipe: 'Earth meets water.' },
  [M.Clay]: { hint: "Mud that's been sitting in water.", recipe: 'Mud left in water settles into clay.' },
  [M.Brick]: { hint: 'Bake something sticky.', recipe: 'Fire clay in a kiln: heat it next to a big fire (charcoal is best).' },
  [M.Loam]: {
    hint: 'Three kinds of ground, mixed together.',
    recipe: 'Earth with sand and clay around it. Seeds love it.',
  },
  [M.Grass]: { hint: 'Where the sand meets the water, give it time.', recipe: 'A sandy shore sprouts grass.' },
  [M.Ice]: { hint: "It's cold at the very top.", recipe: 'Steam that rises to the top sometimes freezes.' },
  [M.Oil]: { hint: 'Bury something that grew, and wait.', recipe: 'Wood or leaves buried under sand turn into oil.' },
  [M.Acid]: { hint: 'What falls when smoke meets rain?', recipe: 'Pour water down onto smoke.' },
  [M.Charcoal]: { hint: 'Smother a wood fire.', recipe: 'Pour sand onto burning wood.' },
  [M.Ash]: { hint: "What's left when the fire is out?", recipe: 'Burnt wood, leaves and grass sometimes leave ash.' },
  [M.Glass]: { hint: 'Sand, but much, much hotter.', recipe: 'Melt sand with lava or a charcoal fire.' },
  [M.Obsidian]: { hint: 'Cool lava in a hurry.', recipe: 'Lava meets ice.' },
  [M.Sulfur]: {
    hint: 'Volcanoes leave yellow deposits where lava meets the sea.',
    recipe: 'Lava meets water (now and then).',
  },
  [M.Saltpetre]: { hint: 'Bury fallen leaves in the earth.', recipe: 'Leaves buried in earth.' },
  [M.Gunpowder]: { hint: 'Three powders, one bang.', recipe: 'Charcoal with sulfur and saltpetre around it.' },
  [M.Nitro]: { hint: 'Something that eats meets something that burns.', recipe: 'Acid meets oil.' },
  [M.Napalm]: { hint: 'Thicken a fuel with something explosive.', recipe: 'Oil meets gunpowder.' },
};

/** Not made by any reaction: awarded once enough other materials have been discovered. */
export const REWARD: { material: MaterialId; after: number; recipe: string } = {
  material: M.Lava,
  after: 10,
  recipe: 'A reward for discovering 10 materials.',
};

export class Discovery {
  readonly unlocked = new Set<MaterialId>();

  /** `saved`: material ids from a previous session (see toJSON). Unknown ids are ignored. */
  constructor(saved: readonly number[] = []) {
    for (const id of STARTERS) this.unlocked.add(id);
    for (const id of saved) if (PALETTE.some((d) => d.id === id)) this.unlocked.add(id as MaterialId);
  }

  /** The material awarded for discovering enough others. */
  get rewardMaterial(): MaterialId {
    return REWARD.material;
  }

  /** Materials in the palette (all of them can be unlocked). */
  get total(): number {
    return PALETTE.length;
  }

  /** Materials discovered by recipe (not counting starters or the reward). */
  get discovered(): number {
    let n = 0;
    for (const id of this.unlocked) if (RECIPES[id]) n++;
    return n;
  }

  isUnlocked(id: MaterialId): boolean {
    return this.unlocked.has(id);
  }

  /** Hint for a locked material, or how it was made for an unlocked one. */
  describe(id: MaterialId): string {
    if (STARTERS.includes(id)) return 'You start with this.';
    if (id === REWARD.material) {
      return this.isUnlocked(id) ? REWARD.recipe : `Discover ${REWARD.after} materials to earn this.`;
    }
    const r = RECIPES[id];
    if (!r) return '';
    return this.isUnlocked(id) ? r.recipe : r.hint;
  }

  /**
   * Check what the simulation has created (World.created) and unlock anything new.
   * Returns the newly unlocked materials, in the order they were unlocked (the reward last).
   */
  update(created: Uint32Array): MaterialId[] {
    const fresh: MaterialId[] = [];
    for (const def of PALETTE) {
      if (!this.unlocked.has(def.id) && RECIPES[def.id] && created[def.id] > 0) {
        this.unlocked.add(def.id);
        fresh.push(def.id);
      }
    }
    if (!this.unlocked.has(REWARD.material) && this.discovered >= REWARD.after) {
      this.unlocked.add(REWARD.material);
      fresh.push(REWARD.material);
    }
    return fresh;
  }

  /** Forget all discoveries; back to the starters. */
  reset(): void {
    this.unlocked.clear();
    for (const id of STARTERS) this.unlocked.add(id);
  }

  /** Unlocked material ids, for saving. */
  toJSON(): number[] {
    return [...this.unlocked];
  }
}
