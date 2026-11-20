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
  [M.Salt]: {
    hint: "Boil water away, and look at what's left behind.",
    recipe: 'Boiling water now and then leaves a grain of salt (boiling salt water leaves lots).',
  },
  [M.SaltWater]: { hint: 'Something white dissolves.', recipe: 'Salt meets water.' },
  [M.Cloud]: { hint: 'Lots of steam, gathered up high.', recipe: 'Steam crowding together at the top forms clouds.' },
  [M.Snow]: { hint: 'A cloud somewhere cold.', recipe: 'A cloud near ice snows instead of raining.' },
  [M.Moss]: { hint: 'Grass that grows against stone.', recipe: 'Grass touching stone turns to moss.' },
  [M.Algae]: {
    hint: "Weeds that reach the water's surface.",
    recipe: 'Grass growing up to the surface of water spreads across it as algae.',
  },
  [M.SwampGas]: { hint: 'Something green, rotting underwater.', recipe: 'Drowned grass gives off bubbles of swamp gas.' },
  [M.IronOre]: { hint: 'Volcanoes hide more than sulfur.', recipe: 'Lava meets water (rarely).' },
  [M.Iron]: { hint: 'Smelt it: very hot fuel against rock.', recipe: 'Burning charcoal against iron ore.' },
  [M.Rust]: { hint: 'Leave metal out in the wet.', recipe: 'Iron meets water (salt water is much faster).' },
  [M.Coal]: { hint: 'Bury charcoal and bake it.', recipe: 'Charcoal shut in with no air around it, heated past 200°.' },
  [M.Tar]: { hint: 'Cook oil gently, before it catches.', recipe: 'Oil heated past 150° (but not yet alight) thickens into tar.' },
  [M.Cement]: {
    hint: 'Ash, sand and water, stirred together.',
    recipe: 'Ash with sand and water around it makes wet cement, which sets into stone.',
  },
  [M.Lye]: { hint: 'Soak the leftovers of a fire.', recipe: 'Ash meets water.' },
  [M.Foam]: { hint: 'What do you get from lye and fat?', recipe: 'Lye meets oil: soap foam.' },
  [M.Thermite]: { hint: 'Grind rust with a fuel.', recipe: 'Rust meets charcoal. It takes a very hot flame to light.' },
  [M.Fireworks]: { hint: 'Gunpowder with a pinch of metal salts.', recipe: 'Gunpowder meets salt or rust.' },
  [M.Mushroom]: { hint: 'Bury wood somewhere dark and damp.', recipe: 'Wood buried in damp ground.' },
  [M.Flower]: { hint: 'Grow a tree in the richest soil.', recipe: 'Trees rooted in loam flower.' },
  [M.Dynamite]: { hint: 'Make the touchiest explosive safe to handle.', recipe: 'Nitroglycerin soaked into clay.' },
  [M.CarbonDioxide]: {
    hint: 'What do glowing coals breathe out?',
    recipe: 'Burning charcoal and coal give it off; so does fizz.',
  },
  [M.DryIce]: { hint: 'Freeze a gas.', recipe: 'Carbon dioxide meets ice or snow.' },
  [M.Fizz]: { hint: 'Ash meets something sour.', recipe: 'Ash meets acid.' },
  [M.Pumice]: { hint: 'Bubble a heavy gas through lava.', recipe: 'Lava meets carbon dioxide.' },
  [M.Quicksand]: { hint: 'Sand that has soaked in the sea.', recipe: 'Sand meets salt water.' },
  [M.Hail]: { hint: 'A stormier sort of snow.', recipe: 'Clouds near ice sometimes hail.' },
  [M.Seaweed]: { hint: 'Grass that finds itself in the sea.', recipe: 'Grass meets salt water.' },
  [M.Cactus]: { hint: 'Plant a seed where there is no water at all.', recipe: 'A seed on dry sand, far from water.' },
  [M.Vine]: { hint: 'Grass that finds something to climb.', recipe: 'Grass meets wood.' },
  [M.StainedGlass]: { hint: 'Colour some glass.', recipe: 'Glass meets rust.' },
  [M.Soot]: { hint: 'Look at the ceiling above a fire.', recipe: 'Smoke meeting cold stone, iron or ice leaves soot.' },
  [M.Mercury]: { hint: 'Roast iron ore with something that burns blue.', recipe: 'Burning sulfur against iron ore.' },
  [M.Lightning]: { hint: 'A storm needs a thick enough cloud.', recipe: 'Deep, thick clouds now and then strike lightning.' },
  [M.Hydrogen]: { hint: 'Run electricity through water.', recipe: 'Electrified metal or salt water touching fresh water splits it into hydrogen.' },
  [M.Battery]: { hint: 'Two different things that conduct, in salt water.', recipe: 'Iron and charcoal close together in salt water.' },
  [M.Sap]: { hint: 'Tap a tree.', recipe: 'Wood with iron touching it oozes sap.' },
  [M.Sugar]: { hint: 'Boil the sap.', recipe: 'Sap heated past 120°.' },
  [M.Caramel]: { hint: 'Cook the sugar further.', recipe: 'Sugar heated past 160°.' },
  [M.Alcohol]: {
    hint: 'Sugar, water and something that ferments.',
    recipe: 'Sugar, water and mushroom (yeast) close together.',
  },
  [M.Vinegar]: { hint: 'Leave the alcohol out.', recipe: 'Alcohol with open air above it slowly sours.' },
  [M.Chlorine]: { hint: 'Run electricity through the sea.', recipe: 'Electrified salt water gives off chlorine.' },
  [M.Bleach]: { hint: 'A sharp gas and a slippery liquid.', recipe: 'Chlorine meets lye.' },
  [M.CopperOre]: { hint: 'Lava meets the sea.', recipe: 'Lava meets salt water (rarely).' },
  [M.Copper]: { hint: 'Smelt the green ore.', recipe: 'Burning charcoal against copper ore.' },
  [M.Verdigris]: { hint: 'Leave copper by the sea.', recipe: 'Copper meets salt water or vinegar.' },
  [M.Plasma]: {
    hint: 'Lightning through the lightest gas, or any gas made unbearably hot.',
    recipe: 'Lightning through hydrogen, or smoke or steam heated past 2000°.',
  },
  [M.Fog]: { hint: 'Warm mist meets something frozen.', recipe: 'Steam meets snow or ice.' },
  [M.Stalactite]: { hint: 'Let the sea seep into a stone cave.', recipe: 'Salt water under a stone ceiling.' },
  [M.Rubber]: { hint: 'Cure the sap with something yellow.', recipe: 'Sap meets sulfur.' },
  [M.SulfurDioxide]: { hint: 'What does burning sulfur give off?', recipe: 'Burning sulfur.' },
  [M.Pulp]: { hint: 'Soak wood in something slippery.', recipe: 'Wood meets lye.' },
  [M.Paper]: { hint: 'Dry out the pulp.', recipe: 'Pulp heated past 100°.' },
  [M.Ink]: { hint: 'Black powder mixed into an oily liquid.', recipe: 'Soot meets oil.' },
  [M.Fruit]: { hint: 'Wait for the flowers.', recipe: 'Flowers ripen into fruit.' },
  [M.Gold]: { hint: 'Pan the sand with liquid metal.', recipe: 'Mercury picks the odd fleck of gold out of sand.' },
  [M.Bamboo]: { hint: 'Plant a seed in rich soil right beside water.', recipe: 'A seed on loam with water within 2 cells.' },
  [M.Wax]: { hint: 'Crack tar with steam.', recipe: 'Tar meets steam.' },
  [M.Glaze]: { hint: 'Fire salt onto brick.', recipe: 'Salt on brick hotter than 300°.' },
  [M.Ozone]: { hint: "What's left in the air after a lightning strike?", recipe: 'Lightning bolts sometimes leave ozone behind.' },
  [M.IronFilings]: { hint: 'Blow up some iron.', recipe: 'Explosions shatter iron into filings.' },
  [M.Magnet]: { hint: 'Strike iron with lightning.', recipe: 'Lightning touching iron now and then magnetises it.' },
  [M.MoltenGlass]: {
    hint: 'Glass, hotter than lava can make it.',
    recipe: 'Glass heated past 1200° (by thermite or plasma).',
  },
  [M.MoltenIron]: { hint: 'Melt iron down.', recipe: 'Iron past 1500°, or what burning thermite leaves behind.' },
  [M.Steel]: { hint: 'Stir carbon into molten iron.', recipe: 'Molten iron meets charcoal.' },
  [M.Amber]: { hint: 'Leave the sap on the sand for a long time.', recipe: 'Sap touching sand slowly hardens into amber.' },
  [M.SaltCrystal]: { hint: 'Chill the sea.', recipe: 'Salt water touching ice or dry ice grows salt crystals.' },
  [M.Basalt]: { hint: 'Let lava cool in the open air.', recipe: 'Lava open to the air slowly crusts over.' },
  [M.GlassFibre]: { hint: 'Molten glass caught in the wind.', recipe: 'Molten glass at the surface, with the wind blowing.' },
  [M.MoltenCopper]: { hint: 'Melt copper down.', recipe: 'Copper heated past 1100° (thermite or plasma).' },
  [M.Tin]: { hint: 'Lava meets wet earth.', recipe: 'Lava meeting mud now and then leaves tin.' },
  [M.Bronze]: { hint: 'Two metals, melted together.', recipe: 'Molten copper meets tin.' },
  [M.GeyserRock]: { hint: 'Let water seep into volcanic rock.', recipe: 'Basalt meets water.' },
  [M.Slag]: { hint: 'Stir sand into molten metal.', recipe: 'Molten iron meets sand.' },
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
