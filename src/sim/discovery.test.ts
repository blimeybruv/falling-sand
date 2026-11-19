import { describe, expect, it } from 'vitest';
import { Discovery, M, PALETTE, RECIPES, REWARD, STARTERS, World, type MaterialId } from './index';

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

    const created = new Uint32Array(64);
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

  it('salt water does not freeze next to ice, and salt melts ice', () => {
    const w = new World(20, 20, 21);
    fillRect(w, 0, 15, 20, 5, M.Ice);
    fillRect(w, 0, 10, 20, 5, M.SaltWater);
    run(w, 1500);
    expect(w.count(M.Ice)).toBe(100);
    expect(w.count(M.SaltWater)).toBe(100);

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

  it('a seed on dry sand stays a seed', () => {
    const w = new World(40, 40, 9);
    fillRect(w, 0, 35, 40, 5, M.Sand);
    w.set(20, 10, M.Seed);
    run(w, 1000);
    expect(w.count(M.Seed)).toBe(1);
    expect(w.count(M.Wood)).toBe(0);
  });
});
