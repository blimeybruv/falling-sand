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

  it('a seed on dry sand stays a seed', () => {
    const w = new World(40, 40, 9);
    fillRect(w, 0, 35, 40, 5, M.Sand);
    w.set(20, 10, M.Seed);
    run(w, 1000);
    expect(w.count(M.Seed)).toBe(1);
    expect(w.count(M.Wood)).toBe(0);
  });
});
