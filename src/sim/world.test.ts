import { describe, expect, it } from 'vitest';
import { M, MATERIALS, MAX_BLAST_RADIUS, MAX_EXPLOSIONS_PER_FRAME, PALETTE, World, type MaterialId } from './index';

function run(world: World, frames: number): void {
  for (let f = 0; f < frames; f++) world.step();
}

function fillRect(world: World, x0: number, y0: number, w: number, h: number, m: MaterialId): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) world.set(x, y, m);
}

/** Height of the column of material m resting at the bottom of column x. */
function columnCount(world: World, x: number, m: MaterialId): number {
  let n = 0;
  for (let y = 0; y < world.height; y++) if (world.get(x, y) === m) n++;
  return n;
}

describe('material table', () => {
  it('is indexed by id and every palette entry has a unique shortcut', () => {
    MATERIALS.forEach((def, id) => expect(def.id).toBe(id));
    const keys = PALETTE.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PALETTE.some((d) => d.id === M.Empty)).toBe(false);
  });

  it('has sane values for every material', () => {
    const inRange = (p: number): boolean => p >= 0 && p <= 1;
    for (const def of MATERIALS) {
      const where = def.name;
      expect(inRange(def.flammability), where).toBe(true);
      expect(inRange(def.extinguishChance), where).toBe(true);
      expect(inRange(def.viscosity), where).toBe(true);
      expect(inRange(def.rise), where).toBe(true);
      expect(def.burnTime[0], where).toBeLessThanOrEqual(def.burnTime[1]);
      // A flammable material with no burn time would "catch" with burn = 0 and never burn.
      if (def.flammability > 0 && !def.explosive) expect(def.burnTime[0], where).toBeGreaterThan(0);
      if (def.lifetime) {
        expect(def.lifetime[0], where).toBeGreaterThan(0);
        expect(def.lifetime[0], where).toBeLessThanOrEqual(def.lifetime[1]);
      }
      if (def.decay) expect(inRange(def.decay.chance), where).toBe(true);
      if (def.explosive) {
        expect(def.explosive.radius, where).toBeGreaterThan(0);
        if (def.explosive.impactSpeed !== undefined) expect(def.explosive.impactSpeed, where).toBeGreaterThan(0);
        if (def.explosive.chance !== undefined) expect(inRange(def.explosive.chance), where).toBe(true);
        expect(def.flammability, where).toBeGreaterThan(0);
      }
      expect(def.conductivity, where).toBeGreaterThanOrEqual(0);
      expect(def.conductivity, where).toBeLessThanOrEqual(0.25); // higher makes diffusion unstable
      expect(inRange(def.cooling), where).toBe(true);
      expect(inRange(def.wind), where).toBe(true);
      if (def.heat) expect(inRange(def.heat.rate), where).toBe(true);
      if (def.ignitesAt !== undefined) expect(def.flammability, where).toBeGreaterThan(0);
      if (def.kind === 'liquid') expect(def.dispersion, where).toBeGreaterThan(0);
    }
  });
});

describe('movement', () => {
  it('moves each cell at most once per frame', () => {
    const w = new World(5, 10, 1);
    w.set(2, 0, M.Sand);
    w.set(2, 9, M.Smoke);
    w.step();
    expect(w.get(2, 1)).toBe(M.Sand);
    let smokeY = -1;
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) if (w.get(x, y) === M.Smoke) smokeY = y;
    expect(smokeY).toBeGreaterThanOrEqual(8);
  });

  it('sand falls to the bottom', () => {
    const w = new World(10, 40, 1);
    w.set(5, 0, M.Sand);
    run(w, 60);
    expect(w.get(5, 39)).toBe(M.Sand);
    expect(w.count(M.Sand)).toBe(1);
  });

  it('sand piles up rather than stacking in a column', () => {
    const w = new World(41, 40, 2);
    for (let f = 0; f < 200; f++) {
      w.set(20, 0, M.Sand);
      w.step();
    }
    run(w, 200);
    expect(w.count(M.Sand)).toBe(200);
    expect(columnCount(w, 20, M.Sand)).toBeLessThan(30);
    expect(columnCount(w, 14, M.Sand)).toBeGreaterThan(0);
    expect(columnCount(w, 26, M.Sand)).toBeGreaterThan(0);
  });

  it('sand sinks through water', () => {
    const w = new World(10, 20, 3);
    fillRect(w, 0, 10, 10, 10, M.Water);
    fillRect(w, 0, 6, 10, 2, M.Sand);
    run(w, 300);
    for (let x = 0; x < 10; x++) {
      expect(w.get(x, 19)).toBe(M.Sand);
      expect(w.get(x, 18)).toBe(M.Sand);
    }
    expect(w.count(M.Water)).toBe(100);
  });

  it('water levels out', () => {
    const w = new World(40, 30, 4);
    fillRect(w, 0, 10, 8, 20, M.Water);
    run(w, 1000);
    expect(w.count(M.Water)).toBe(160);
    const heights = Array.from({ length: 40 }, (_, x) => columnCount(w, x, M.Water));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  });

  it('oil floats on water', () => {
    const w = new World(20, 24, 5);
    fillRect(w, 0, 16, 20, 8, M.Oil);
    fillRect(w, 0, 8, 20, 8, M.Water);
    run(w, 1500);
    expect(w.count(M.Oil)).toBe(160);
    expect(w.count(M.Water)).toBe(160);
    for (let x = 0; x < 20; x++) {
      let lowestOil = -1;
      let highestWater = w.height;
      for (let y = 0; y < w.height; y++) {
        if (w.get(x, y) === M.Oil) lowestOil = Math.max(lowestOil, y);
        if (w.get(x, y) === M.Water) highestWater = Math.min(highestWater, y);
      }
      expect(lowestOil).toBeLessThan(highestWater);
    }
  });

  it('smoke rises and fades away', () => {
    const w = new World(10, 30, 6);
    fillRect(w, 3, 25, 4, 4, M.Smoke);
    run(w, 10);
    expect(columnCount(w, 4, M.Smoke) + columnCount(w, 5, M.Smoke)).toBeLessThan(8);
    run(w, 400);
    expect(w.count(M.Smoke)).toBe(0);
  });
});

describe('fire', () => {
  it('burns wood away', () => {
    const w = new World(40, 40, 7);
    fillRect(w, 15, 30, 10, 10, M.Wood);
    w.set(20, 29, M.Fire);
    w.ignite(w.idx(20, 30));
    run(w, 4000);
    expect(w.count(M.Wood)).toBe(0);
  });

  it('a cell that just caught fire does not spread it until the next frame', () => {
    // A box packed with oil (very flammable, and nowhere to flow). Fire must spread at most one
    // ring per frame; without the stamp, cells above the source would ignite their own neighbours
    // in the same frame because the scan reaches them later.
    for (let seed = 1; seed <= 20; seed++) {
      const w = new World(21, 21, seed);
      fillRect(w, 0, 0, 21, 21, M.Oil);
      w.ignite(w.idx(10, 10));
      w.step();
      for (let y = 0; y < 21; y++)
        for (let x = 0; x < 21; x++)
          if (w.burn[w.idx(x, y)] > 0) expect(Math.max(Math.abs(x - 10), Math.abs(y - 10))).toBeLessThanOrEqual(1);
    }
  });

  it('water puts fire out, turning it to steam', () => {
    const w = new World(10, 10, 8);
    fillRect(w, 0, 8, 10, 2, M.Water);
    w.set(5, 7, M.Fire);
    w.step();
    expect(w.count(M.Fire)).toBe(0);
    expect(w.count(M.Steam)).toBe(1);
  });

  it('stone does not burn', () => {
    const w = new World(10, 10, 9);
    fillRect(w, 0, 5, 10, 5, M.Stone);
    w.paint(5, 4, 3, M.Fire);
    run(w, 200);
    expect(w.count(M.Stone)).toBe(50);
  });
});

describe('explosions', () => {
  it('clears exactly the capped radius, and stone survives', () => {
    const size = 80;
    const c = 40;
    const w = new World(size, size, 10);
    fillRect(w, 0, 0, size, size, M.Sand);
    w.set(c + 3, c, M.Stone);
    expect(w.explode(c, c, 1000)).toBe(true);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d2 = (x - c) ** 2 + (y - c) ** 2;
        const m = w.get(x, y);
        if (x === c + 3 && y === c) expect(m).toBe(M.Stone);
        else if (d2 <= MAX_BLAST_RADIUS ** 2) expect([M.Empty, M.Fire]).toContain(m);
        else expect(m).toBe(M.Sand);
      }
    }
  });

  it('throws nearby loose particles, which fly and then land', () => {
    const w = new World(120, 80, 12);
    fillRect(w, 50, 50, 21, 21, M.Sand);
    const before = w.count(M.Sand);
    w.explode(60, 60, 6);
    expect(w.count(M.Sand)).toBeLessThan(before); // the middle was destroyed
    let flying = 0;
    for (let i = 0; i < w.size; i++) if (w.vx[i] !== 0 || w.vy[i] !== 0) flying++;
    expect(flying).toBeGreaterThan(0);

    run(w, 10);
    let thrown = 0;
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < 120; x++)
        if (w.get(x, y) === M.Sand && (x < 50 || x > 70 || y < 50)) thrown++;
    expect(thrown).toBeGreaterThan(0); // some debris flew out of the original square

    run(w, 300);
    for (let i = 0; i < w.size; i++) expect(w.vx[i] === 0 && w.vy[i] === 0).toBe(true); // everything landed
  });

  it('a launched particle follows an arc', () => {
    const w = new World(60, 60, 19);
    w.set(5, 50, M.Sand);
    w.launch(w.idx(5, 50), 2, -3);
    let minY = 50;
    let x = 5;
    for (let f = 0; f < 60; f++) {
      w.step();
      for (let i = 0; i < w.size; i++)
        if (w.mat[i] === M.Sand) {
          minY = Math.min(minY, Math.floor(i / w.width));
          x = i % w.width;
        }
    }
    expect(minY).toBeLessThan(40); // went up
    expect(x).toBeGreaterThan(20); // and across
    expect(w.get(x, 59)).toBe(M.Sand); // and came down
  });

  it('limits explosions per frame', () => {
    const w = new World(50, 50, 13);
    for (let k = 0; k < MAX_EXPLOSIONS_PER_FRAME; k++) expect(w.explode(25, 25, 3)).toBe(true);
    expect(w.explode(25, 25, 3)).toBe(false);
    w.step();
    expect(w.explode(25, 25, 3)).toBe(true);
  });

  it('nitroglycerin explodes when it falls hard, but not when set down gently', () => {
    const drop = new World(30, 60, 14);
    fillRect(drop, 0, 55, 30, 5, M.Stone);
    drop.set(15, 0, M.Nitro);
    run(drop, 80);
    expect(drop.count(M.Nitro)).toBe(0);
    expect(drop.count(M.Stone)).toBe(150);

    const gentle = new World(30, 60, 15);
    fillRect(gentle, 0, 55, 30, 5, M.Stone);
    gentle.set(15, 53, M.Nitro);
    run(gentle, 80);
    expect(gentle.count(M.Nitro)).toBe(1);
  });

  it('nitroglycerin explodes on fire', () => {
    const w = new World(30, 30, 16);
    w.set(15, 29, M.Nitro);
    w.paint(15, 29, 0, M.Fire);
    run(w, 10);
    expect(w.count(M.Nitro)).toBe(0);
  });

  it('a large chain of nitroglycerin stays bounded and burns itself out', () => {
    const w = new World(200, 120, 17);
    fillRect(w, 0, 40, 200, 80, M.Nitro);
    w.paint(100, 40, 2, M.Fire);
    let worst = 0;
    for (let f = 0; f < 600 && w.count(M.Nitro) > 0; f++) {
      const t0 = performance.now();
      w.step();
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(w.count(M.Nitro)).toBe(0);
    // Generous bound for slow CI machines; in practice a frame is a few milliseconds.
    expect(worst).toBeLessThan(250);
  });
});

describe('plant', () => {
  it('grows into neighbouring water', () => {
    const w = new World(20, 20, 18);
    fillRect(w, 0, 10, 20, 10, M.Water);
    w.set(10, 15, M.Grass);
    run(w, 600);
    expect(w.count(M.Grass)).toBeGreaterThan(1);
  });
});

describe('temperature', () => {
  it('relaxes back to room temperature', () => {
    const w = new World(10, 10, 20);
    fillRect(w, 0, 9, 10, 1, M.Stone);
    w.temp[w.idx(5, 9)] = 800;
    run(w, 3000);
    for (let i = 0; i < w.size; i++) expect(Math.abs(w.temp[i] - 20)).toBeLessThan(5);
  });

  it('conducts heat through stone and boils the water above it', () => {
    const w = new World(20, 20, 21);
    fillRect(w, 0, 17, 20, 3, M.Lava);
    fillRect(w, 0, 15, 20, 2, M.Stone);
    fillRect(w, 0, 5, 20, 10, M.Water);
    run(w, 1500);
    expect(w.count(M.Water)).toBeLessThan(200 * 0.8);
  });

  it('wood catches fire from heat alone', () => {
    const w = new World(10, 10, 22);
    w.set(5, 5, M.Wood);
    w.temp[w.idx(5, 5)] = 400;
    w.step();
    expect(w.burn[w.idx(5, 5)]).toBeGreaterThan(0);
  });
});

describe('lava', () => {
  it('sets wood alight', () => {
    const w = new World(30, 30, 23);
    fillRect(w, 0, 25, 30, 5, M.Wood);
    fillRect(w, 10, 22, 10, 3, M.Lava);
    run(w, 1500);
    expect(w.count(M.Wood)).toBeLessThan(150);
  });

  it('meets water: the water boils and the lava sets to stone', () => {
    const w = new World(20, 30, 24);
    fillRect(w, 0, 20, 20, 10, M.Water);
    fillRect(w, 5, 5, 10, 3, M.Lava);
    run(w, 400);
    expect(w.count(M.Lava)).toBeLessThan(30);
    expect(w.count(M.Stone)).toBeGreaterThan(0);
    expect(w.count(M.Water)).toBeLessThan(200);
  });
});

describe('ice', () => {
  it('stays frozen at room temperature', () => {
    const w = new World(20, 20, 25);
    fillRect(w, 5, 15, 10, 5, M.Ice);
    run(w, 2000);
    expect(w.count(M.Ice)).toBe(50);
  });

  it('melts near heat', () => {
    // Full width, so the lava can't flow out from under the ice.
    const w = new World(10, 20, 26);
    fillRect(w, 0, 10, 10, 5, M.Ice);
    fillRect(w, 0, 15, 10, 5, M.Lava);
    run(w, 1500);
    expect(w.count(M.Ice)).toBeLessThan(25);
  });

  it('slowly freezes neighbouring water', () => {
    const w = new World(20, 20, 27);
    fillRect(w, 0, 10, 20, 10, M.Water);
    w.set(10, 15, M.Ice);
    run(w, 1500);
    expect(w.count(M.Ice)).toBeGreaterThan(3);
  });
});

describe('acid', () => {
  it('dissolves what it touches, using itself up, but not stone or water', () => {
    const w = new World(20, 30, 28);
    fillRect(w, 0, 27, 20, 3, M.Stone);
    fillRect(w, 0, 20, 20, 7, M.Wood);
    fillRect(w, 0, 10, 20, 3, M.Acid);
    run(w, 2000);
    expect(w.count(M.Wood)).toBeLessThan(140);
    expect(w.count(M.Acid)).toBeLessThan(60);
    expect(w.count(M.Stone)).toBe(60);

    const pond = new World(20, 20, 29);
    fillRect(pond, 0, 10, 20, 10, M.Water);
    fillRect(pond, 0, 5, 20, 2, M.Acid);
    run(pond, 500);
    expect(pond.count(M.Water)).toBe(200);
  });
});

describe('gunpowder', () => {
  it('burns along a line like a fuse, popping as it goes', () => {
    const w = new World(80, 20, 30);
    fillRect(w, 0, 19, 80, 1, M.Stone);
    fillRect(w, 5, 18, 70, 1, M.Gunpowder);
    w.paint(5, 18, 0, M.Fire);
    run(w, 400);
    expect(w.count(M.Gunpowder)).toBe(0);
  });
});

describe('wind', () => {
  it('pushes smoke and falling sand downwind', () => {
    const w = new World(100, 60, 31);
    w.wind = 1;
    fillRect(w, 45, 50, 10, 5, M.Smoke);
    for (let x = 45; x < 55; x++) w.set(x, 0, M.Sand);
    run(w, 60);
    let smokeX = 0;
    let smokeN = 0;
    let sandX = 0;
    let sandN = 0;
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 100; x++) {
        if (w.get(x, y) === M.Smoke) { smokeX += x; smokeN++; }
        if (w.get(x, y) === M.Sand) { sandX += x; sandN++; }
      }
    expect(smokeX / smokeN).toBeGreaterThan(55);
    expect(sandX / sandN).toBeGreaterThan(51);
  });
});
