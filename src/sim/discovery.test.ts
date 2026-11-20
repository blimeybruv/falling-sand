import { describe, expect, it } from 'vitest';
import { CHARGE_ACTIVE, Discovery, M, MATERIALS, PALETTE, RECIPES, REWARD, STARTERS, World, type MaterialId } from './index';

function run(world: World, frames: number): void {
  for (let f = 0; f < frames; f++) world.step();
}

function fillRect(world: World, x0: number, y0: number, w: number, h: number, m: MaterialId): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) world.set(x, y, m);
}

describe('discovery rules', () => {
  it('every palette material can be discovered: a starter, a recipe or the reward', () => {
    for (const def of PALETTE) {
      const ways = [STARTERS.includes(def.id), RECIPES[def.id] !== undefined, REWARD.material === def.id];
      expect(ways.filter(Boolean).length, def.name).toBe(1);
    }
  });

  it('counts only what the simulation creates, not what is painted', () => {
    const w = new World(20, 20, 1);
    w.paint(10, 10, 3, M.Smoke);
    w.set(5, 5, M.Steam);
    expect(w.created[M.Smoke]).toBe(0);
    expect(w.created[M.Steam]).toBe(0);
  });

  it('starts with the starters, unlocks what has been created, and awards the reward', () => {
    const d = new Discovery();
    for (const id of STARTERS) expect(d.isUnlocked(id)).toBe(true);
    expect(d.isUnlocked(M.Steam)).toBe(false);

    const created = new Uint32Array(MATERIALS.length);
    created[M.Steam] = 3;
    created[M.Sand] = 9; // already unlocked: not reported again
    expect(d.update(created)).toEqual([M.Steam]);
    expect(d.update(created)).toEqual([]);

    const recipes = Object.keys(RECIPES).map(Number) as MaterialId[];
    for (const id of recipes.slice(0, REWARD.after - 1)) created[id] = 1;
    expect(d.update(created)).not.toContain(REWARD.material);
    for (const id of recipes) created[id] = 1;
    const fresh = d.update(created);
    expect(fresh[fresh.length - 1]).toBe(REWARD.material);
    expect(d.unlocked.size).toBe(d.total);
  });

  it('restores saved progress and ignores junk', () => {
    const d = new Discovery([M.Acid, 999, -1]);
    expect(d.isUnlocked(M.Acid)).toBe(true);
    expect(new Discovery(d.toJSON()).unlocked).toEqual(d.unlocked);
  });

  it('gives hints before and recipes after', () => {
    const d = new Discovery();
    expect(d.describe(M.Steam)).toBe(RECIPES[M.Steam]!.hint);
    d.unlocked.add(M.Steam);
    expect(d.describe(M.Steam)).toBe(RECIPES[M.Steam]!.recipe);
    expect(d.describe(M.Sand)).toMatch(/start/);
  });
});

/** Each recipe, done the way the hint suggests, actually makes the material in the simulation. */
describe('every recipe works in the simulation', () => {
  const cases: [string, MaterialId, number, (w: World) => void][] = [
    ['smoke: a fire burns out', M.Smoke, 100, (w) => fillRect(w, 18, 30, 4, 2, M.Fire)],
    ['steam: fire meets water', M.Steam, 50, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Water);
      fillRect(w, 15, 33, 10, 2, M.Fire);
    }],
    ['wood: a seed on damp sand grows into a tree', M.Wood, 2500, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Sand);
      fillRect(w, 10, 30, 1, 5, M.Stone);
      fillRect(w, 0, 30, 10, 5, M.Water);
      w.set(12, 10, M.Seed);
    }],
    ['clay: mud settles in water', M.Clay, 1000, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Earth);
      fillRect(w, 0, 28, 40, 7, M.Water);
    }],
    ['loam: earth with sand and clay', M.Loam, 300, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Sand);
      fillRect(w, 0, 35, 40, 2, M.Earth);
      fillRect(w, 0, 33, 40, 2, M.Clay);
    }],
    ['grass: a sandy shore sprouts', M.Grass, 3000, (w) => {
      fillRect(w, 0, 30, 20, 10, M.Water);
      fillRect(w, 20, 30, 20, 10, M.Sand);
    }],
    ['ice: steam at the top freezes', M.Ice, 1000, (w) => fillRect(w, 0, 0, 40, 3, M.Steam)],
    ['oil: buried wood', M.Oil, 4000, (w) => {
      fillRect(w, 0, 10, 40, 30, M.Sand);
      fillRect(w, 10, 20, 20, 5, M.Wood);
    }],
    ['acid: rain on smoke', M.Acid, 300, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Smoke);
      fillRect(w, 0, 10, 40, 5, M.Water);
    }],
    ['charcoal: smothering a wood fire with sand', M.Charcoal, 300, (w) => {
      fillRect(w, 0, 39, 40, 1, M.Stone);
      fillRect(w, 5, 36, 30, 3, M.Wood);
      for (let x = 5; x < 35; x++) w.ignite(w.idx(x, 36));
      fillRect(w, 5, 33, 30, 3, M.Sand);
    }],
    ['ash: wood burns out', M.Ash, 1500, (w) => {
      fillRect(w, 10, 30, 20, 10, M.Wood);
      for (let x = 10; x < 30; x++) w.ignite(w.idx(x, 30));
    }],
    ['gunpowder: charcoal, sulfur and saltpetre', M.Gunpowder, 300, (w) => {
      fillRect(w, 0, 38, 40, 2, M.Charcoal);
      fillRect(w, 0, 37, 40, 1, M.Sulfur);
      fillRect(w, 0, 36, 40, 1, M.Saltpetre);
    }],
    ['mud: earth meets water', M.Mud, 200, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Earth);
      fillRect(w, 0, 30, 40, 5, M.Water);
    }],
    ['brick: clay fired next to a wood fire', M.Brick, 900, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Stone);
      fillRect(w, 15, 32, 10, 5, M.Clay);
      fillRect(w, 10, 34, 5, 3, M.Wood);
      fillRect(w, 25, 34, 5, 3, M.Wood);
      for (let y = 34; y < 37; y++) for (const x of [10, 11, 12, 13, 14, 25, 26, 27, 28, 29]) w.ignite(w.idx(x, y));
    }],
    ['glass: sand melted by lava', M.Glass, 600, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Sand);
      fillRect(w, 0, 25, 40, 5, M.Lava);
    }],
    ['glass: sand melted in a charcoal fire', M.Glass, 900, (w) => {
      fillRect(w, 0, 39, 40, 1, M.Stone);
      fillRect(w, 5, 30, 30, 9, M.Charcoal);
      fillRect(w, 18, 33, 4, 3, M.Sand);
      for (let y = 30; y < 39; y++) for (let x = 5; x < 35; x++) w.ignite(w.idx(x, y));
    }],
    ['obsidian: lava meets ice', M.Obsidian, 300, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Ice);
      fillRect(w, 10, 25, 20, 4, M.Lava);
    }],
    ['sulfur: lava meets water', M.Sulfur, 400, (w) => {
      fillRect(w, 0, 25, 40, 15, M.Water);
      fillRect(w, 10, 5, 20, 4, M.Lava);
    }],
    ['salt: boiling water leaves some behind', M.Salt, 300, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Lava);
      fillRect(w, 0, 20, 40, 10, M.Water);
    }],
    ['salt water: salt meets water', M.SaltWater, 100, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Water);
      fillRect(w, 10, 20, 20, 3, M.Salt);
    }],
    ['cloud: steam crowding at the top', M.Cloud, 400, (w) => fillRect(w, 0, 0, 40, 3, M.Steam)],
    ['snow: a cloud near ice', M.Snow, 800, (w) => {
      fillRect(w, 0, 0, 40, 2, M.Cloud);
      fillRect(w, 0, 6, 40, 1, M.Ice);
    }],
    ['moss: grass touching stone', M.Moss, 600, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Stone);
      fillRect(w, 0, 34, 40, 1, M.Grass);
    }],
    ['algae: weeds reach the surface', M.Algae, 1500, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Water);
      fillRect(w, 18, 33, 4, 1, M.Grass);
    }],
    ['swamp gas: drowned grass rots', M.SwampGas, 800, (w) => {
      fillRect(w, 0, 39, 40, 1, M.Grass);
      fillRect(w, 0, 25, 40, 14, M.Water);
    }],
    ['iron ore: lava meets water (rarely)', M.IronOre, 600, (w) => {
      fillRect(w, 0, 25, 40, 15, M.Water);
      fillRect(w, 0, 5, 40, 4, M.Lava);
    }],
    ['iron: smelting ore with burning charcoal', M.Iron, 200, (w) => {
      fillRect(w, 0, 37, 40, 3, M.IronOre);
      fillRect(w, 0, 34, 40, 3, M.Charcoal);
      for (let x = 0; x < 40; x++) w.ignite(w.idx(x, 36));
    }],
    ['rust: iron in salt water', M.Rust, 400, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Iron);
      fillRect(w, 0, 30, 40, 7, M.SaltWater);
    }],
    ['coal: charcoal buried and baked', M.Coal, 2000, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Lava);
      fillRect(w, 0, 32, 40, 3, M.Stone);
      fillRect(w, 0, 29, 40, 3, M.Charcoal);
      fillRect(w, 0, 20, 40, 9, M.Sand);
    }],
    ['tar: oil cooked gently in a stone pot', M.Tar, 1500, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Lava);
      fillRect(w, 0, 33, 40, 2, M.Stone);
      fillRect(w, 0, 25, 40, 8, M.Oil);
    }],
    ['cement: ash, sand and water', M.Cement, 300, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Sand);
      fillRect(w, 0, 36, 40, 1, M.Water);
      fillRect(w, 0, 35, 40, 1, M.Ash);
    }],
    ['lye: ash meets water', M.Lye, 600, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Water);
      fillRect(w, 0, 25, 40, 2, M.Ash);
    }],
    ['foam: lye meets oil', M.Foam, 200, (w) => {
      fillRect(w, 0, 33, 40, 7, M.Lye);
      fillRect(w, 0, 28, 40, 4, M.Oil);
    }],
    ['thermite: rust meets charcoal', M.Thermite, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Rust);
      fillRect(w, 0, 33, 40, 3, M.Charcoal);
    }],
    ['fireworks: gunpowder meets salt', M.Fireworks, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Salt);
      fillRect(w, 0, 33, 40, 3, M.Gunpowder);
    }],
    ['mushroom: wood buried in damp ground', M.Mushroom, 4000, (w) => {
      fillRect(w, 0, 22, 40, 18, M.Earth);
      fillRect(w, 15, 25, 10, 4, M.Wood);
      fillRect(w, 0, 18, 40, 4, M.Water);
    }],
    ['flower: a tree grown in loam', M.Flower, 3000, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Loam);
      w.set(20, 20, M.Seed);
    }],
    ['dynamite: nitroglycerin soaked into clay', M.Dynamite, 300, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Clay);
      fillRect(w, 0, 32, 40, 3, M.Nitro);
    }],
    ['carbon dioxide: burning charcoal gives it off', M.CarbonDioxide, 600, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Stone);
      fillRect(w, 5, 34, 30, 3, M.Charcoal);
      for (let x = 5; x < 35; x++) w.ignite(w.idx(x, 34));
    }],
    ['dry ice: carbon dioxide meets ice', M.DryIce, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Ice);
      fillRect(w, 0, 30, 40, 4, M.CarbonDioxide);
    }],
    ['fizz: ash meets acid', M.Fizz, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Acid);
      fillRect(w, 0, 32, 40, 2, M.Ash);
    }],
    ['pumice: lava meets carbon dioxide', M.Pumice, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Lava);
      fillRect(w, 0, 30, 40, 4, M.CarbonDioxide);
    }],
    ['quicksand: sand meets salt water', M.Quicksand, 600, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Sand);
      fillRect(w, 0, 30, 40, 5, M.SaltWater);
    }],
    ['hail: a cloud near ice', M.Hail, 1500, (w) => {
      fillRect(w, 0, 0, 40, 2, M.Cloud);
      fillRect(w, 0, 6, 40, 1, M.Ice);
    }],
    ['seaweed: grass meets salt water', M.Seaweed, 600, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Grass);
      fillRect(w, 0, 25, 40, 12, M.SaltWater);
    }],
    ['cactus: a seed on dry sand', M.Cactus, 4000, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Sand);
      w.set(20, 20, M.Seed);
    }],
    ['vine: grass meets wood', M.Vine, 600, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Grass);
      fillRect(w, 18, 20, 4, 17, M.Wood);
    }],
    ['stained glass: glass meets rust', M.StainedGlass, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Glass);
      fillRect(w, 0, 33, 40, 3, M.Rust);
    }],
    ['soot: smoke under a stone ceiling', M.Soot, 400, (w) => {
      fillRect(w, 0, 0, 40, 3, M.Stone);
      fillRect(w, 0, 3, 40, 5, M.Smoke);
    }],
    ['mercury: burning sulfur against iron ore', M.Mercury, 300, (w) => {
      fillRect(w, 0, 37, 40, 3, M.IronOre);
      fillRect(w, 0, 35, 40, 2, M.Sulfur);
      for (let x = 0; x < 40; x++) w.ignite(w.idx(x, 36));
    }],
    ['lightning: a thick cloud strikes', M.Lightning, 2500, (w) => {
      fillRect(w, 0, 0, 40, 12, M.Cloud);
      fillRect(w, 0, 38, 40, 2, M.Stone);
    }],
    ['battery: iron and charcoal in salt water', M.Battery, 300, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Iron);
      fillRect(w, 0, 36, 40, 1, M.Charcoal);
      fillRect(w, 0, 30, 40, 6, M.SaltWater);
    }],
    ['hydrogen: electricity through water', M.Hydrogen, 400, (w) => {
      fillRect(w, 0, 39, 40, 1, M.Iron);
      w.set(0, 38, M.Battery);
      fillRect(w, 1, 30, 39, 9, M.Water);
    }],
    ['sap: tapping wood with iron', M.Sap, 500, (w) => {
      fillRect(w, 0, 38, 40, 2, M.Stone);
      fillRect(w, 18, 20, 4, 18, M.Wood);
      fillRect(w, 22, 25, 3, 1, M.Iron);
    }],
    ['sugar: boiling sap', M.Sugar, 600, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Lava);
      fillRect(w, 0, 34, 40, 2, M.Stone);
      fillRect(w, 0, 30, 40, 4, M.Sap);
    }],
    ['caramel: cooking sugar', M.Caramel, 600, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Lava);
      fillRect(w, 0, 34, 40, 2, M.Stone);
      fillRect(w, 0, 31, 40, 3, M.Sugar);
    }],
    ['alcohol: sugar, water and mushroom', M.Alcohol, 300, (w) => {
      fillRect(w, 0, 38, 40, 2, M.Mushroom);
      fillRect(w, 0, 37, 40, 1, M.Water);
      fillRect(w, 0, 36, 40, 1, M.Sugar);
    }],
    ['vinegar: alcohol left open', M.Vinegar, 600, (w) => fillRect(w, 0, 35, 40, 5, M.Alcohol)],
    ['chlorine: electrified salt water', M.Chlorine, 600, (w) => {
      fillRect(w, 0, 35, 40, 5, M.SaltWater);
      w.set(0, 34, M.Battery);
    }],
    ['bleach: chlorine meets lye', M.Bleach, 300, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Lye);
      fillRect(w, 0, 30, 40, 4, M.Chlorine);
    }],
    ['copper ore: lava meets salt water', M.CopperOre, 600, (w) => {
      fillRect(w, 0, 25, 40, 15, M.SaltWater);
      fillRect(w, 0, 5, 40, 4, M.Lava);
    }],
    ['copper: smelting copper ore', M.Copper, 200, (w) => {
      fillRect(w, 0, 37, 40, 3, M.CopperOre);
      fillRect(w, 0, 34, 40, 3, M.Charcoal);
      for (let x = 0; x < 40; x++) w.ignite(w.idx(x, 36));
    }],
    ['verdigris: copper in salt water', M.Verdigris, 400, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Copper);
      fillRect(w, 0, 30, 40, 7, M.SaltWater);
    }],
    ['plasma: lightning through hydrogen', M.Plasma, 30, (w) => {
      fillRect(w, 0, 20, 40, 10, M.Hydrogen);
      fillRect(w, 20, 20, 1, 10, M.Lightning);
    }],
    ['fog: steam meets snow', M.Fog, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Snow);
      fillRect(w, 0, 30, 40, 6, M.Steam);
    }],
    ['stalactite: salt water under a stone ceiling', M.Stalactite, 400, (w) => {
      fillRect(w, 0, 0, 40, 3, M.Stone);
      fillRect(w, 0, 3, 40, 37, M.SaltWater);
    }],
    ['rubber: sap meets sulfur', M.Rubber, 200, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Sap);
      fillRect(w, 0, 33, 40, 2, M.Sulfur);
    }],
    ['sulfur dioxide: burning sulfur', M.SulfurDioxide, 400, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Stone);
      fillRect(w, 0, 34, 40, 3, M.Sulfur);
      for (let x = 0; x < 40; x++) w.ignite(w.idx(x, 34));
    }],
    ['pulp: wood meets lye', M.Pulp, 400, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Wood);
      fillRect(w, 0, 30, 40, 6, M.Lye);
    }],
    ['paper: drying pulp', M.Paper, 600, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Lava);
      fillRect(w, 0, 34, 40, 2, M.Stone);
      fillRect(w, 0, 31, 40, 3, M.Pulp);
    }],
    ['ink: soot meets oil', M.Ink, 200, (w) => {
      fillRect(w, 0, 34, 40, 6, M.Oil);
      fillRect(w, 0, 30, 40, 2, M.Soot);
    }],
    ['fruit: flowers ripen', M.Fruit, 1500, (w) => fillRect(w, 0, 10, 40, 3, M.Flower)],
    ['gold: mercury pans sand', M.Gold, 800, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Mercury);
      fillRect(w, 0, 30, 40, 5, M.Sand);
    }],
    ['bamboo: a seed on loam right beside water', M.Bamboo, 1500, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Loam);
      fillRect(w, 10, 30, 1, 5, M.Stone);
      fillRect(w, 0, 30, 10, 5, M.Water);
      w.set(11, 10, M.Seed);
    }],
    ['wax: tar meets steam', M.Wax, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Tar);
      fillRect(w, 0, 30, 40, 6, M.Steam);
    }],
    ['glaze: salt fired onto brick', M.Glaze, 1500, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Lava);
      fillRect(w, 0, 35, 40, 1, M.Brick);
      fillRect(w, 0, 33, 40, 2, M.Salt);
    }],
    ['ozone: lightning leaves it behind', M.Ozone, 30, (w) => fillRect(w, 10, 10, 20, 2, M.Lightning)],
    ['iron filings: blowing up iron', M.IronFilings, 30, (w) => {
      fillRect(w, 10, 30, 20, 5, M.Iron);
      w.set(20, 29, M.Nitro);
      w.ignite(w.idx(20, 29));
    }],
    ['magnet: lightning on iron', M.Magnet, 30, (w) => {
      fillRect(w, 20, 0, 1, 40, M.Iron);
      fillRect(w, 21, 0, 1, 40, M.Lightning);
    }],
    ['molten glass: thermite on glass', M.MoltenGlass, 400, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Glass);
      fillRect(w, 10, 26, 20, 4, M.Thermite);
      for (let x = 10; x < 30; x++) for (let y = 26; y < 30; y++) w.ignite(w.idx(x, y));
    }],
    ['molten iron: what burning thermite leaves', M.MoltenIron, 300, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Stone);
      fillRect(w, 10, 33, 20, 4, M.Thermite);
      for (let x = 10; x < 30; x++) for (let y = 33; y < 37; y++) w.ignite(w.idx(x, y));
    }],
    ['steel: molten iron meets charcoal', M.Steel, 10, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Charcoal);
      fillRect(w, 0, 34, 40, 3, M.MoltenIron);
    }],
    ['amber: sap left on sand', M.Amber, 1500, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Sand);
      fillRect(w, 0, 32, 40, 3, M.Sap);
    }],
    ['salt crystal: salt water chilled by ice', M.SaltCrystal, 600, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Ice);
      fillRect(w, 0, 28, 40, 8, M.SaltWater);
    }],
    ['basalt: lava cooling in open air', M.Basalt, 600, (w) => fillRect(w, 0, 35, 40, 5, M.Lava)],
    ['glass fibre: molten glass in the wind', M.GlassFibre, 300, (w) => {
      w.wind = 1;
      fillRect(w, 0, 36, 40, 4, M.MoltenGlass);
    }],
    ['molten copper: copper melted by thermite', M.MoltenCopper, 400, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Copper);
      fillRect(w, 10, 26, 20, 4, M.Thermite);
      for (let x = 10; x < 30; x++) for (let y = 26; y < 30; y++) w.ignite(w.idx(x, y));
    }],
    ['tin: lava meets mud', M.Tin, 600, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Mud);
      fillRect(w, 0, 10, 40, 4, M.Lava);
    }],
    ['bronze: molten copper meets tin', M.Bronze, 10, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Tin);
      fillRect(w, 0, 34, 40, 3, M.MoltenCopper);
    }],
    ['geyser rock: basalt meets water', M.GeyserRock, 400, (w) => {
      fillRect(w, 0, 35, 40, 5, M.Basalt);
      fillRect(w, 0, 30, 40, 5, M.Water);
    }],
    ['slag: molten iron meets sand', M.Slag, 10, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Sand);
      fillRect(w, 0, 34, 40, 3, M.MoltenIron);
    }],
    ['briquette: charcoal meets clay', M.Briquette, 300, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Clay);
      fillRect(w, 0, 33, 40, 3, M.Charcoal);
    }],
    ['terracotta: clay warmed gently beside a fire', M.Terracotta, 1200, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Stone);
      fillRect(w, 0, 31, 4, 6, M.Wood);
      for (let x = 0; x < 4; x++) for (let y = 31; y < 37; y++) w.ignite(w.idx(x, y));
      fillRect(w, 4, 31, 12, 6, M.Clay);
    }],
    ['porcelain: ash on brick fired by lava', M.Porcelain, 1500, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Lava);
      fillRect(w, 0, 35, 40, 1, M.Brick);
      fillRect(w, 0, 33, 40, 2, M.Ash);
    }],
    ['gravel: blowing up basalt', M.Gravel, 30, (w) => {
      fillRect(w, 10, 30, 20, 8, M.Basalt);
      w.set(20, 29, M.Nitro);
      w.ignite(w.idx(20, 29));
    }],
    ['concrete: cement meets gravel', M.Concrete, 100, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Gravel);
      fillRect(w, 0, 33, 40, 3, M.Cement);
    }],
    ['peat: grass buried under earth', M.Peat, 600, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Stone);
      fillRect(w, 0, 36, 40, 1, M.Grass);
      fillRect(w, 0, 30, 40, 6, M.Earth);
    }],
    ['brimstone: sulfur melted gently', M.Brimstone, 600, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Lava);
      fillRect(w, 0, 34, 40, 2, M.Stone);
      fillRect(w, 0, 31, 40, 3, M.Sulfur);
    }],
    ['quartz: sand buried deep under lava', M.Quartz, 2500, (w) => {
      fillRect(w, 0, 20, 40, 20, M.Sand);
      fillRect(w, 0, 14, 40, 6, M.Lava);
    }],
    ['tar sand: tar meets sand', M.TarSand, 200, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Sand);
      fillRect(w, 0, 32, 40, 4, M.Tar);
    }],
    ['soap bubble: foam in the wind', M.Bubble, 300, (w) => {
      w.wind = 1;
      fillRect(w, 0, 36, 40, 4, M.Foam);
    }],
    ['honeydew: flowers drip it', M.Honeydew, 1500, (w) => fillRect(w, 0, 10, 40, 3, M.Flower)],
    ['adobe: mud meets grass', M.Adobe, 300, (w) => {
      fillRect(w, 0, 37, 40, 3, M.Grass);
      fillRect(w, 0, 33, 40, 4, M.Mud);
    }],
    ['quicklime: stalactite in a charcoal fire', M.Quicklime, 1500, (w) => {
      fillRect(w, 0, 39, 40, 1, M.Stone);
      fillRect(w, 5, 30, 30, 9, M.Charcoal);
      fillRect(w, 18, 33, 4, 3, M.Stalactite);
      for (let y = 30; y < 39; y++) for (let x = 5; x < 35; x++) w.ignite(w.idx(x, y));
    }],
    ['slaked lime: quicklime meets water', M.SlakedLime, 200, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Quicklime);
      fillRect(w, 0, 30, 40, 6, M.Water);
    }],
    ['mortar: slaked lime meets sand', M.Mortar, 200, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Sand);
      fillRect(w, 0, 32, 40, 4, M.SlakedLime);
    }],
    ['frost: steam meets dry ice', M.Frost, 200, (w) => {
      fillRect(w, 0, 36, 40, 4, M.DryIce);
      fillRect(w, 0, 30, 40, 6, M.Steam);
    }],
    ['permafrost: earth touching ice', M.Permafrost, 600, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Ice);
      fillRect(w, 0, 32, 40, 4, M.Earth);
    }],
    ['graphite: lightning through charcoal', M.Graphite, 30, (w) => {
      fillRect(w, 0, 32, 40, 8, M.Charcoal);
      fillRect(w, 0, 31, 40, 1, M.Lightning);
    }],
    ['diamond: graphite baked by thermite', M.Diamond, 400, (w) => {
      fillRect(w, 0, 32, 40, 8, M.Graphite);
      fillRect(w, 10, 28, 20, 4, M.Thermite);
      for (let x = 10; x < 30; x++) for (let y = 28; y < 32; y++) w.ignite(w.idx(x, y));
    }],
    ['smoke bomb: saltpetre meets sugar', M.SmokeBomb, 200, (w) => {
      fillRect(w, 0, 36, 40, 4, M.Saltpetre);
      fillRect(w, 0, 33, 40, 3, M.Sugar);
    }],
    ['saltpetre: leaves buried in earth', M.Saltpetre, 600, (w) => {
      fillRect(w, 10, 30, 20, 4, M.Leaf);
      fillRect(w, 0, 34, 40, 6, M.Earth);
      fillRect(w, 0, 20, 40, 10, M.Earth);
    }],
    ['nitroglycerin: acid meets oil', M.Nitro, 300, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Oil);
      fillRect(w, 10, 20, 20, 3, M.Acid);
    }],
    ['napalm: oil meets gunpowder', M.Napalm, 300, (w) => {
      fillRect(w, 0, 30, 40, 10, M.Oil);
      fillRect(w, 10, 20, 20, 3, M.Gunpowder);
    }],
  ];
  for (const [name, target, frames, setup] of cases) {
    it(name, () => {
      const w = new World(40, 40, 7);
      setup(w);
      expect(w.created[target]).toBe(0);
      run(w, frames);
      expect(w.created[target]).toBeGreaterThan(0);
    });
  }

  it('a tree has a wooden trunk and leaves', () => {
    const w = new World(40, 50, 8);
    fillRect(w, 0, 45, 40, 5, M.Sand);
    fillRect(w, 0, 40, 10, 5, M.Water);
    fillRect(w, 10, 40, 1, 5, M.Stone);
    w.set(12, 30, M.Seed);
    run(w, 3000);
    expect(w.count(M.Wood)).toBeGreaterThan(8);
    expect(w.count(M.Leaf)).toBeGreaterThan(10);
    expect(w.count(M.Seed)).toBe(0); // fully grown
  });

  it('a seed on loam grows a tree without any water', () => {
    const w = new World(40, 50, 10);
    fillRect(w, 0, 45, 40, 5, M.Loam);
    w.set(20, 30, M.Seed);
    run(w, 3000);
    expect(w.count(M.Wood)).toBeGreaterThan(12);
    expect(w.count(M.Water)).toBe(0);
  });

  it('earth and sand alone make no loam; it takes clay too, and only where they meet', () => {
    const two = new World(40, 40, 11);
    fillRect(two, 0, 30, 40, 10, M.Sand);
    fillRect(two, 0, 20, 40, 10, M.Earth);
    run(two, 500);
    expect(two.count(M.Loam)).toBe(0);

    const three = new World(40, 40, 12);
    fillRect(three, 0, 30, 40, 10, M.Sand);
    fillRect(three, 0, 28, 40, 2, M.Earth);
    fillRect(three, 0, 23, 40, 5, M.Clay);
    run(three, 1000);
    expect(three.count(M.Loam)).toBeGreaterThan(0);
    expect(three.count(M.Loam)).toBeLessThan(three.count(M.Sand)); // a seam, not the whole pile
  });

  it('clay is sticky and fires into brick', () => {
    const w = new World(40, 40, 13);
    for (let f = 0; f < 150; f++) {
      w.set(20, 0, M.Clay);
      w.step();
    }
    run(w, 200);
    let height = 0;
    for (let y = 0; y < 40; y++) if (w.get(20, y) === M.Clay) height++;
    expect(height).toBeGreaterThan(15); // a steep pile; sand would spread out much flatter

    const kiln = new World(10, 10, 14);
    kiln.set(5, 9, M.Clay);
    kiln.temp[kiln.idx(5, 9)] = 700;
    kiln.step();
    expect(kiln.get(5, 9)).toBe(M.Brick);
  });

  it('smoke rising away from a pond makes no acid; it takes rain from above', () => {
    const w = new World(40, 40, 15);
    fillRect(w, 0, 30, 40, 10, M.Water);
    fillRect(w, 0, 27, 40, 3, M.Smoke); // sitting on the surface
    run(w, 300);
    expect(w.created[M.Acid]).toBe(0);
  });

  it('an ordinary wood fire does not melt sand into glass', () => {
    const w = new World(40, 40, 20);
    fillRect(w, 0, 30, 40, 10, M.Sand);
    fillRect(w, 5, 25, 30, 5, M.Wood);
    for (let x = 5; x < 35; x++) for (let y = 25; y < 30; y++) w.ignite(w.idx(x, y));
    run(w, 1200);
    expect(w.created[M.Glass]).toBe(0);
  });

  it('acid cannot eat glass, brick or obsidian', () => {
    const w = new World(30, 30, 16);
    fillRect(w, 0, 27, 10, 3, M.Glass);
    fillRect(w, 10, 27, 10, 3, M.Brick);
    fillRect(w, 20, 27, 10, 3, M.Obsidian);
    fillRect(w, 0, 20, 30, 7, M.Acid);
    run(w, 1000);
    expect(w.count(M.Glass) + w.count(M.Brick) + w.count(M.Obsidian)).toBe(90);
  });

  it('mud dries back to earth when heated', () => {
    const w = new World(10, 10, 17);
    w.set(5, 9, M.Mud);
    w.temp[w.idx(5, 9)] = 150;
    w.step();
    expect(w.get(5, 9)).toBe(M.Earth);
  });

  it('ash floats on water and charcoal burns hot', () => {
    const w = new World(20, 30, 18);
    fillRect(w, 0, 20, 20, 10, M.Water);
    fillRect(w, 5, 10, 10, 2, M.Ash);
    run(w, 200);
    let lowestAsh = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Ash) lowestAsh = Math.max(lowestAsh, Math.floor(i / 20));
    expect(lowestAsh).toBeLessThanOrEqual(20);

    const fire = new World(10, 10, 19);
    fire.set(5, 9, M.Charcoal);
    fire.ignite(fire.idx(5, 9));
    run(fire, 60);
    expect(fire.temp[fire.idx(5, 9)]).toBeGreaterThan(800);
  });

  it('salt water does not freeze next to ice (it grows crystals), and salt melts ice', () => {
    const w = new World(20, 20, 21);
    fillRect(w, 0, 15, 20, 5, M.Ice);
    fillRect(w, 0, 10, 20, 5, M.SaltWater);
    run(w, 1500);
    expect(w.count(M.Ice)).toBe(100);
    expect(w.created[M.Ice]).toBe(0); // it never freezes (it grows salt crystals instead)
    expect(w.count(M.SaltWater) + w.count(M.SaltCrystal)).toBe(100);

    const melt = new World(20, 20, 22);
    fillRect(melt, 0, 15, 20, 5, M.Ice);
    fillRect(melt, 0, 13, 20, 2, M.Salt);
    run(melt, 400);
    expect(melt.count(M.Ice)).toBeLessThan(100);
  });

  it('salt water sinks under fresh water', () => {
    const w = new World(10, 20, 23);
    fillRect(w, 0, 15, 10, 5, M.Water);
    fillRect(w, 0, 10, 10, 5, M.SaltWater);
    run(w, 600);
    for (let x = 0; x < 10; x++) expect(w.get(x, 19)).toBe(M.SaltWater);
  });

  it('clouds rain', () => {
    const w = new World(30, 30, 24);
    fillRect(w, 0, 0, 30, 2, M.Cloud);
    run(w, 300);
    expect(w.created[M.Water]).toBeGreaterThan(0);
  });

  it('snow stays frozen in the open but melts near heat', () => {
    const w = new World(20, 20, 25);
    fillRect(w, 5, 15, 10, 5, M.Snow);
    run(w, 1000);
    expect(w.count(M.Snow)).toBe(50);
    const warm = new World(20, 20, 26);
    fillRect(warm, 0, 15, 20, 5, M.Snow);
    fillRect(warm, 0, 12, 20, 3, M.Lava);
    run(warm, 300);
    expect(warm.count(M.Snow)).toBeLessThan(100);
  });

  it('moss creeps over damp stone', () => {
    const w = new World(30, 30, 27);
    fillRect(w, 0, 25, 30, 5, M.Stone);
    fillRect(w, 0, 20, 5, 5, M.Water);
    fillRect(w, 5, 20, 1, 5, M.Stone);
    w.set(8, 24, M.Moss);
    run(w, 2000);
    expect(w.count(M.Moss)).toBeGreaterThan(3);
  });

  it('algae floats on water and spreads across it', () => {
    const w = new World(30, 20, 28);
    fillRect(w, 0, 10, 30, 10, M.Water);
    w.set(15, 5, M.Algae);
    run(w, 2000);
    expect(w.count(M.Algae)).toBeGreaterThan(3);
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Algae) expect(Math.floor(i / 30)).toBeLessThanOrEqual(10);
  });

  it('swamp gas flashes into fire', () => {
    const w = new World(20, 20, 29);
    fillRect(w, 5, 5, 10, 5, M.SwampGas);
    w.paint(10, 10, 1, M.Fire);
    run(w, 30);
    expect(w.count(M.SwampGas)).toBeLessThan(20);
  });

  it('iron rusts much faster in salt water than in fresh water', () => {
    const fresh = new World(20, 20, 30);
    fillRect(fresh, 0, 17, 20, 3, M.Iron);
    fillRect(fresh, 0, 10, 20, 7, M.Water);
    const salty = new World(20, 20, 30);
    fillRect(salty, 0, 17, 20, 3, M.Iron);
    fillRect(salty, 0, 10, 20, 7, M.SaltWater);
    run(fresh, 600);
    run(salty, 600);
    expect(salty.count(M.Rust)).toBeGreaterThan(fresh.count(M.Rust) * 2);
  });

  it('trees on damp sand never flower, and open-air wood by water never grows mushrooms', () => {
    const w = new World(40, 50, 31);
    fillRect(w, 0, 45, 40, 5, M.Sand);
    fillRect(w, 0, 40, 10, 5, M.Water);
    fillRect(w, 10, 40, 1, 5, M.Stone);
    w.set(12, 30, M.Seed);
    run(w, 4000);
    expect(w.count(M.Wood)).toBeGreaterThan(8);
    expect(w.created[M.Flower]).toBe(0);
    expect(w.created[M.Mushroom]).toBe(0);
  });

  it('oil left at room temperature stays oil, and charcoal in the open stays charcoal', () => {
    const w = new World(30, 30, 32);
    fillRect(w, 0, 25, 30, 5, M.Oil);
    fillRect(w, 10, 20, 10, 2, M.Charcoal);
    run(w, 1000);
    expect(w.created[M.Tar]).toBe(0);
    expect(w.created[M.Coal]).toBe(0);
  });

  it('cement sets into stone', () => {
    const w = new World(20, 20, 33);
    fillRect(w, 0, 15, 20, 5, M.Cement);
    run(w, 800);
    expect(w.count(M.Cement)).toBe(0);
    expect(w.count(M.Stone)).toBe(100);
  });

  it('lye neutralises acid into salt water', () => {
    const w = new World(20, 20, 34);
    fillRect(w, 0, 15, 20, 5, M.Acid);
    fillRect(w, 0, 10, 20, 3, M.Lye);
    run(w, 300);
    expect(w.count(M.SaltWater)).toBeGreaterThan(10);
  });

  it('foam smothers a fire', () => {
    const fire = (foam: boolean): number => {
      const w = new World(30, 30, 35);
      fillRect(w, 0, 27, 30, 3, M.Stone);
      fillRect(w, 5, 24, 20, 3, M.Wood);
      for (let x = 5; x < 25; x++) for (let y = 24; y < 27; y++) w.ignite(w.idx(x, y));
      if (foam) fillRect(w, 3, 18, 24, 5, M.Foam);
      run(w, 200);
      return w.count(M.Wood);
    };
    expect(fire(true)).toBeGreaterThan(fire(false));
  });

  it('thermite burns through stone', () => {
    const w = new World(20, 30, 36);
    fillRect(w, 0, 20, 20, 10, M.Stone);
    fillRect(w, 5, 17, 10, 3, M.Thermite);
    for (let x = 5; x < 15; x++) w.ignite(w.idx(x, 19));
    run(w, 300);
    expect(w.count(M.Stone)).toBeLessThan(200);
    expect(w.created[M.Lava]).toBeGreaterThan(0);
  });

  it('a lit firework shoots up and bursts into sparks', () => {
    const w = new World(40, 80, 37);
    fillRect(w, 0, 79, 40, 1, M.Stone);
    w.set(20, 78, M.Fireworks);
    w.ignite(w.idx(20, 78));
    let highest = 78;
    for (let f = 0; f < 80; f++) {
      w.step();
      for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Fireworks) highest = Math.min(highest, Math.floor(i / 40));
    }
    expect(highest).toBeLessThan(55);
    expect(w.created[M.Spark]).toBeGreaterThan(5);
  });

  it('dynamite ignores a hard landing but explodes in a fire', () => {
    const drop = new World(30, 60, 41);
    fillRect(drop, 0, 55, 30, 5, M.Stone);
    fillRect(drop, 14, 0, 2, 2, M.Dynamite);
    // Static, so it stays put rather than falling: a knock can't set it off.
    run(drop, 80);
    expect(drop.count(M.Dynamite)).toBe(4);

    const lit = new World(40, 40, 42);
    fillRect(lit, 0, 37, 40, 3, M.Stone);
    fillRect(lit, 25, 34, 5, 3, M.Sand);
    fillRect(lit, 19, 34, 2, 3, M.Dynamite);
    lit.paint(19, 34, 0, M.Fire); // a flame on the dynamite lights it
    run(lit, 200);
    expect(lit.count(M.Dynamite)).toBe(0);
    expect(lit.count(M.Sand)).toBeLessThan(15); // the blast took the nearby sand
  });

  it('carbon dioxide sinks below air and smothers a buried fire', () => {
    const w = new World(20, 30, 43);
    fillRect(w, 5, 5, 10, 3, M.CarbonDioxide);
    run(w, 100);
    let lowest = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.CarbonDioxide) lowest = Math.max(lowest, Math.floor(i / 20));
    expect(lowest).toBe(29);

    const burning = (co2: boolean): number => {
      const b = new World(30, 30, 44);
      fillRect(b, 0, 27, 30, 3, M.Stone);
      fillRect(b, 0, 25, 30, 2, M.Wood);
      for (let x = 0; x < 30; x++) for (let y = 25; y < 27; y++) b.ignite(b.idx(x, y));
      if (co2) fillRect(b, 0, 15, 30, 10, M.CarbonDioxide);
      run(b, 120);
      return b.count(M.Wood);
    };
    expect(burning(true)).toBeGreaterThan(burning(false));
  });

  it('dry ice freezes water and slowly turns back into gas', () => {
    const w = new World(20, 20, 45);
    fillRect(w, 0, 17, 20, 3, M.DryIce);
    fillRect(w, 0, 12, 20, 5, M.Water);
    run(w, 600);
    expect(w.count(M.Ice)).toBeGreaterThan(0);
    expect(w.created[M.CarbonDioxide]).toBeGreaterThan(0);
  });

  it('pumice floats; sand sinks slowly into quicksand', () => {
    const w = new World(20, 30, 46);
    fillRect(w, 0, 20, 20, 10, M.Water);
    fillRect(w, 5, 10, 10, 2, M.Pumice);
    run(w, 300);
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Pumice) expect(Math.floor(i / 20)).toBeLessThanOrEqual(20);

    const q = new World(20, 30, 47);
    fillRect(q, 0, 20, 20, 10, M.Quicksand);
    q.set(10, 10, M.Sand);
    run(q, 600);
    let sandY = 0;
    for (let i = 0; i < q.size; i++) if (q.mat[i] === M.Sand) sandY = Math.floor(i / 20);
    expect(sandY).toBeGreaterThan(21);
  });

  it('seaweed grows up through salt water but not fresh water', () => {
    const grow = (liquid: MaterialId): number => {
      const w = new World(20, 30, 48);
      fillRect(w, 0, 10, 20, 20, liquid);
      w.set(10, 29, M.Seaweed);
      run(w, 2000);
      return w.count(M.Seaweed);
    };
    expect(grow(M.SaltWater)).toBeGreaterThan(5);
    expect(grow(M.Water)).toBe(1);
  });

  it('vines climb walls', () => {
    const w = new World(30, 40, 49);
    fillRect(w, 15, 0, 2, 40, M.Stone);
    w.set(14, 39, M.Vine);
    run(w, 3000);
    let top = 39;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Vine) top = Math.min(top, Math.floor(i / 30));
    expect(top).toBeLessThan(30);
  });

  it('a seed on dry sand grows a cactus, never a tree', () => {
    const w = new World(40, 40, 9);
    fillRect(w, 0, 35, 40, 5, M.Sand);
    w.set(20, 10, M.Seed);
    run(w, 4000);
    expect(w.count(M.Cactus)).toBeGreaterThan(3);
    expect(w.count(M.Wood)).toBe(0);
  });
});

describe('electricity', () => {
  /** An iron wire along row y, from x0 to x1 inclusive. */
  function wire(w: World, x0: number, x1: number, y: number): void {
    for (let x = x0; x <= x1; x++) w.set(x, y, M.Iron);
  }

  it('a pulse travels along a wire, one cell a frame, and dies away without bouncing back', () => {
    const w = new World(70, 20, 50);
    wire(w, 0, 59, 10);
    w.electrify(w.idx(0, 10));
    let furthest = 0;
    for (let f = 0; f < 70; f++) {
      w.step();
      for (let x = 0; x < 70; x++) if (w.charge[w.idx(x, 10)] > 0) furthest = Math.max(furthest, x);
    }
    expect(furthest).toBe(59);
    run(w, 20);
    for (let x = 0; x < 70; x++) expect(w.charge[w.idx(x, 10)]).toBe(0);
  });

  it('does not jump a gap or pass through stone', () => {
    const w = new World(50, 20, 51);
    wire(w, 0, 19, 10);
    w.set(20, 10, M.Stone);
    wire(w, 21, 40, 10);
    w.electrify(w.idx(0, 10));
    for (let f = 0; f < 60; f++) {
      w.step();
      for (let x = 21; x <= 40; x++) expect(w.charge[w.idx(x, 10)]).toBe(0);
    }
  });

  it('a wire sets off gunpowder at its far end', () => {
    const w = new World(60, 20, 52);
    fillRect(w, 0, 19, 60, 1, M.Stone);
    wire(w, 0, 50, 18);
    fillRect(w, 51, 15, 5, 4, M.Gunpowder);
    const before = w.count(M.Gunpowder);
    w.electrify(w.idx(0, 18));
    run(w, 150);
    expect(w.count(M.Gunpowder)).toBeLessThan(before);
  });

  it('salt water and mercury conduct; fresh water does not', () => {
    const w = new World(30, 20, 53);
    fillRect(w, 0, 15, 30, 5, M.SaltWater);
    expect(w.electrify(w.idx(0, 19))).toBe(true);
    let reached = 0;
    for (let f = 0; f < 40; f++) {
      w.step();
      for (let i = 0; i < w.size; i++) if (w.charge[i] > 0) reached = Math.max(reached, i % 30);
    }
    expect(reached).toBeGreaterThan(20);

    const fresh = new World(10, 10, 54);
    fresh.set(5, 9, M.Water);
    expect(fresh.electrify(fresh.idx(5, 9))).toBe(false);
    const hg = new World(10, 10, 55);
    hg.set(5, 9, M.Mercury);
    expect(hg.electrify(hg.idx(5, 9))).toBe(true);
  });

  it('a battery pulses again and again; drawing lightning on a wire sparks it', () => {
    const w = new World(40, 10, 56);
    w.set(0, 5, M.Battery);
    wire(w, 1, 30, 5);
    let pulses = 0;
    for (let f = 0; f < 600; f++) {
      w.step();
      if (w.charge[w.idx(10, 5)] === CHARGE_ACTIVE) pulses++;
    }
    expect(pulses).toBeGreaterThan(3);

    const brush = new World(20, 10, 57);
    wire(brush, 0, 19, 5);
    brush.paint(10, 5, 0, M.Lightning);
    expect(brush.charge[brush.idx(10, 5)]).toBe(CHARGE_ACTIVE);
  });

  it('hydrogen burns away, leaving water', () => {
    const w = new World(20, 20, 58);
    fillRect(w, 5, 5, 10, 5, M.Hydrogen);
    w.paint(10, 10, 1, M.Fire);
    run(w, 30);
    expect(w.count(M.Hydrogen)).toBeLessThan(50);
    expect(w.created[M.Water]).toBeGreaterThan(0);
  });

  it('mercury sinks under water, and sand floats on it', () => {
    const w = new World(10, 30, 59);
    fillRect(w, 0, 20, 10, 5, M.Water);
    fillRect(w, 0, 15, 10, 3, M.Mercury);
    run(w, 300);
    for (let x = 0; x < 10; x++) expect(w.get(x, 29)).toBe(M.Mercury);

    const f = new World(10, 30, 60);
    fillRect(f, 0, 25, 10, 5, M.Mercury);
    f.set(5, 10, M.Sand);
    run(f, 200);
    let sandY = 0;
    for (let i = 0; i < f.size; i++) if (f.mat[i] === M.Sand) sandY = Math.floor(i / 10);
    expect(sandY).toBeLessThan(25);
  });
});

describe('kitchen and electrochemistry', () => {
  it('wood at room temperature with nothing touching it never oozes sap', () => {
    const w = new World(30, 30, 61);
    fillRect(w, 0, 28, 30, 2, M.Stone);
    fillRect(w, 10, 10, 10, 18, M.Wood);
    run(w, 1500);
    expect(w.created[M.Sap]).toBe(0);
  });

  it('chlorine wilts plants', () => {
    const w = new World(30, 20, 62);
    fillRect(w, 0, 18, 30, 2, M.Stone);
    fillRect(w, 0, 17, 30, 1, M.Grass);
    fillRect(w, 0, 10, 30, 5, M.Chlorine);
    run(w, 300);
    expect(w.count(M.Grass)).toBeLessThan(15);
  });

  it('bleach kills algae and fades stained glass back to glass', () => {
    const w = new World(30, 20, 63);
    fillRect(w, 0, 17, 30, 3, M.StainedGlass);
    fillRect(w, 0, 10, 30, 7, M.Bleach);
    w.set(15, 5, M.Algae);
    run(w, 400);
    expect(w.count(M.Glass)).toBeGreaterThan(0);
    expect(w.count(M.Algae)).toBe(0);
  });

  it('vinegar cleans rust away', () => {
    const w = new World(30, 20, 64);
    fillRect(w, 0, 17, 30, 3, M.Rust);
    fillRect(w, 0, 10, 30, 7, M.Vinegar);
    run(w, 400);
    expect(w.count(M.Rust)).toBeLessThan(90);
  });

  it('copper conducts; verdigris does not', () => {
    const w = new World(40, 10, 65);
    for (let x = 0; x < 30; x++) w.set(x, 5, M.Copper);
    w.electrify(w.idx(0, 5));
    let reached = 0;
    for (let f = 0; f < 40; f++) {
      w.step();
      for (let x = 0; x < 40; x++) if (w.charge[w.idx(x, 5)] > 0) reached = Math.max(reached, x);
    }
    expect(reached).toBe(29);
    const v = new World(10, 10, 66);
    v.set(5, 5, M.Verdigris);
    expect(v.electrify(v.idx(5, 5))).toBe(false);
  });
});

describe('round 3', () => {
  it('any gas heated past 2000° becomes plasma', () => {
    const w = new World(10, 10, 70);
    w.set(5, 5, M.Smoke);
    w.temp[w.idx(5, 5)] = 2500;
    w.step();
    expect(w.created[M.Plasma]).toBe(1);
  });

  it('clouds in sulfur dioxide rain acid', () => {
    const w = new World(40, 40, 71);
    fillRect(w, 0, 0, 40, 2, M.Cloud);
    fillRect(w, 0, 2, 40, 3, M.SulfurDioxide);
    run(w, 300);
    expect(w.created[M.Acid]).toBeGreaterThan(0);
  });

  it('rubber does not conduct; gold does', () => {
    const w = new World(10, 10, 72);
    w.set(1, 1, M.Rubber);
    w.set(3, 3, M.Gold);
    expect(w.electrify(w.idx(1, 1))).toBe(false);
    expect(w.electrify(w.idx(3, 3))).toBe(true);
  });

  it('stalactites only grow from stone ceilings, not from a pool floor', () => {
    const w = new World(30, 30, 73);
    fillRect(w, 0, 25, 30, 5, M.Stone);
    fillRect(w, 0, 15, 30, 10, M.SaltWater);
    run(w, 1000);
    expect(w.created[M.Stalactite]).toBe(0);
  });
});

describe('round 3, part 2', () => {
  it('wax melts when warm and sets again when it cools', () => {
    const w = new World(10, 10, 80);
    fillRect(w, 3, 9, 4, 1, M.Wax);
    for (let x = 3; x < 7; x++) w.temp[w.idx(x, 9)] = 100;
    w.step();
    expect(w.count(M.MoltenWax)).toBe(4);
    run(w, 1500);
    expect(w.count(M.MoltenWax)).toBe(0);
    expect(w.count(M.Wax)).toBe(4);
  });

  it('molten iron sets back into iron as it cools', () => {
    const w = new World(20, 10, 81);
    fillRect(w, 0, 9, 20, 1, M.Stone);
    fillRect(w, 8, 6, 4, 3, M.MoltenIron);
    run(w, 600);
    expect(w.count(M.MoltenIron)).toBe(0);
    expect(w.count(M.Iron)).toBe(12);
  });

  it('a magnet pulls iron filings towards it', () => {
    const w = new World(30, 10, 82);
    fillRect(w, 0, 9, 30, 1, M.Stone);
    fillRect(w, 5, 7, 1, 2, M.Magnet);
    fillRect(w, 10, 8, 3, 1, M.IronFilings);
    const distance = (): number => {
      let d = 0;
      for (let i = 0; i < w.size; i++) if (w.mat[i] === M.IronFilings) d += Math.abs((i % 30) - 5);
      return d;
    };
    const before = distance();
    run(w, 600);
    expect(distance()).toBeLessThan(before);
  });

  it('seeds on loam far from water grow trees, not bamboo', () => {
    const w = new World(40, 50, 83);
    fillRect(w, 0, 45, 40, 5, M.Loam);
    w.set(20, 30, M.Seed);
    run(w, 2000);
    expect(w.created[M.Bamboo]).toBe(0);
    expect(w.count(M.Wood)).toBeGreaterThan(10);
  });
});

describe('round 4', () => {
  it('lava under water hardly crusts into basalt; lava in open air does', () => {
    const basalt = (underwater: boolean): number => {
      const w = new World(30, 30, 90);
      fillRect(w, 0, 25, 30, 5, M.Lava);
      if (underwater) fillRect(w, 0, 10, 30, 15, M.Water);
      run(w, 300);
      return w.created[M.Basalt];
    };
    // Boiling water can briefly leave a gap of air above the lava, so not quite never.
    expect(basalt(true)).toBeLessThan(basalt(false) / 4);
  });

  it('molten glass with no wind stays molten glass (until it cools)', () => {
    const w = new World(20, 10, 91);
    fillRect(w, 0, 7, 20, 3, M.MoltenGlass);
    run(w, 200);
    expect(w.created[M.GlassFibre]).toBe(0);
  });

  it('hot geyser rock erupts; cold geyser rock does not', () => {
    const erupts = (hot: boolean): number => {
      const w = new World(20, 40, 92);
      fillRect(w, 0, 39, 20, 1, M.GeyserRock);
      if (hot) for (let x = 0; x < 20; x++) w.temp[w.idx(x, 39)] = 400;
      let highest = 39;
      for (let f = 0; f < 120; f++) {
        if (hot) for (let x = 0; x < 20; x++) w.temp[w.idx(x, 39)] = 400;
        w.step();
        for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Water) highest = Math.min(highest, Math.floor(i / 20));
      }
      return 39 - highest;
    };
    expect(erupts(true)).toBeGreaterThan(10);
    expect(erupts(false)).toBe(0);
  });

  it('molten copper sets back into copper', () => {
    const w = new World(20, 10, 93);
    fillRect(w, 0, 9, 20, 1, M.Stone);
    fillRect(w, 8, 6, 4, 3, M.MoltenCopper);
    run(w, 600);
    expect(w.count(M.MoltenCopper)).toBe(0);
    expect(w.count(M.Copper)).toBe(12);
  });
});

describe('round 5', () => {
  it('water seeps slowly through terracotta', () => {
    const w = new World(20, 20, 100);
    fillRect(w, 0, 10, 20, 1, M.Terracotta);
    fillRect(w, 0, 5, 20, 5, M.Water);
    run(w, 600);
    let below = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Water && Math.floor(i / 20) > 10) below++;
    expect(below).toBeGreaterThan(5);
  });

  it('concrete survives a blast that clears the gravel around it', () => {
    const w = new World(40, 40, 101);
    fillRect(w, 10, 20, 20, 10, M.Concrete);
    w.explode(20, 25, 10);
    expect(w.count(M.Concrete)).toBe(200);
  });

  it('brimstone sets back into sulfur as it cools, and burning sulfur stays alight', () => {
    const w = new World(20, 10, 102);
    fillRect(w, 0, 9, 20, 1, M.Stone);
    fillRect(w, 5, 7, 10, 2, M.Brimstone);
    run(w, 800);
    expect(w.count(M.Brimstone)).toBe(0);
    expect(w.count(M.Sulfur)).toBe(20);

    const fire = new World(10, 10, 103);
    fire.set(5, 9, M.Sulfur);
    fire.ignite(fire.idx(5, 9));
    run(fire, 5);
    expect(fire.get(5, 9)).toBe(M.Sulfur);
    expect(fire.burn[fire.idx(5, 9)]).toBeGreaterThan(0);
  });

  it('heated tar sand gives back oil', () => {
    const w = new World(20, 20, 104);
    fillRect(w, 0, 18, 20, 2, M.Lava);
    fillRect(w, 0, 16, 20, 2, M.Stone);
    fillRect(w, 0, 13, 20, 3, M.TarSand);
    run(w, 1500);
    expect(w.created[M.Oil]).toBeGreaterThan(0);
  });
});

describe('round 6', () => {
  it('slaking quicklime gets hot enough to boil the water', () => {
    const w = new World(20, 20, 110);
    fillRect(w, 0, 16, 20, 4, M.Quicklime);
    fillRect(w, 0, 10, 20, 6, M.Water);
    run(w, 400);
    expect(w.created[M.Steam]).toBeGreaterThan(0);
  });

  it('frost and permafrost thaw away from the cold', () => {
    const w = new World(20, 10, 111);
    fillRect(w, 0, 9, 20, 1, M.Stone);
    fillRect(w, 5, 8, 4, 1, M.Frost);
    fillRect(w, 12, 8, 4, 1, M.Permafrost);
    run(w, 3000);
    expect(w.count(M.Frost)).toBe(0);
    expect(w.count(M.Permafrost)).toBe(0);
    expect(w.created[M.Mud]).toBeGreaterThan(0);
  });

  it('a lit smoke bomb pours out smoke', () => {
    const w = new World(30, 30, 112);
    fillRect(w, 0, 29, 30, 1, M.Stone);
    fillRect(w, 12, 26, 6, 3, M.SmokeBomb);
    w.paint(15, 25, 1, M.Fire);
    run(w, 100);
    expect(w.created[M.Smoke]).toBeGreaterThan(40);
  });

  it('graphite conducts; adobe crumbles back to mud in water', () => {
    const g = new World(10, 10, 113);
    g.set(5, 5, M.Graphite);
    expect(g.electrify(g.idx(5, 5))).toBe(true);
    const a = new World(20, 20, 114);
    fillRect(a, 0, 17, 20, 3, M.Adobe);
    fillRect(a, 0, 10, 20, 7, M.Water);
    run(a, 1500);
    expect(a.count(M.Adobe)).toBeLessThan(60);
  });
});

describe('red sprites', () => {
  it('flash in the open sky above a thick storm cloud, red heads above violet tendrils', () => {
    // A tall world, so there is upper atmosphere above the cloud layer (which starts 22% down).
    const w = new World(60, 120, 120);
    fillRect(w, 0, 22, 60, 12, M.Cloud);
    let cloudTop = 22;
    let seen = 0;
    let headAboveTendrils = false;
    for (let f = 0; f < 3000 && seen === 0; f++) {
      w.step();
      let redY = Infinity;
      let violetY = -Infinity;
      for (let i = 0; i < w.size; i++) {
        if (w.mat[i] !== M.Sprite) continue;
        seen++;
        const y = Math.floor(i / 60);
        if (w.shade[i] <= 2) redY = Math.min(redY, y);
        if (w.shade[i] >= 10) violetY = Math.max(violetY, y);
      }
      if (seen) {
        for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Cloud) cloudTop = Math.min(cloudTop, Math.floor(i / 60));
        for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Sprite) expect(Math.floor(i / 60)).toBeLessThan(cloudTop);
        headAboveTendrils = redY < violetY;
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect(headAboveTendrils).toBe(true);
    expect(w.created[M.Sprite]).toBeGreaterThan(0);
  });

  it('never appear without room: a storm with no open sky above it makes none', () => {
    const w = new World(60, 40, 121);
    fillRect(w, 0, 0, 60, 14, M.Cloud);
    run(w, 3000);
    expect(w.created[M.Lightning]).toBeGreaterThan(0);
    expect(w.created[M.Sprite]).toBe(0);
  });

  it('each flash lasts under half a second (at most 28 frames)', () => {
    const w = new World(60, 120, 122);
    fillRect(w, 0, 22, 60, 12, M.Cloud);
    let seen = 0;
    for (let f = 0; f < 3000; f++) {
      w.step();
      for (let i = 0; i < w.size; i++) {
        if (w.mat[i] !== M.Sprite) continue;
        seen++;
        expect(w.life[i]).toBeLessThanOrEqual(28);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
