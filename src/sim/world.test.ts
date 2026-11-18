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
        expect(def.explosive.impactSpeed, where).toBeGreaterThan(0);
        expect(def.flammability, where).toBeGreaterThan(0);
      }
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

  it('throws nearby loose particles outwards', () => {
    const w = new World(80, 80, 12);
    fillRect(w, 30, 30, 21, 21, M.Sand);
    const before = w.count(M.Sand);
    w.explode(40, 40, 6);
    expect(w.count(M.Sand)).toBeLessThan(before); // the middle was destroyed
    let thrown = 0;
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < 80; x++)
        if (w.get(x, y) === M.Sand && (x < 30 || x > 50 || y < 30 || y > 50)) thrown++;
    expect(thrown).toBeGreaterThan(0); // and some of the ring landed outside the original square
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
    w.set(10, 15, M.Plant);
    run(w, 600);
    expect(w.count(M.Plant)).toBeGreaterThan(1);
  });
});
