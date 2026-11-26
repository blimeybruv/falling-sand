import { describe, expect, it } from 'vitest';
import { AMBIENT_TEMP, CHARGE_ACTIVE, M, MATERIALS, MAX_BLAST_RADIUS, MAX_EXPLOSIONS_PER_FRAME, PALETTE, World, gustAt, sunAt, type MaterialId } from './index';
import { FALLING_ICE, GIANT_TIP, PINE_SEED } from './behaviours';

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
  it('is indexed by id and no two palette entries share a shortcut', () => {
    MATERIALS.forEach((def, id) => expect(def.id).toBe(id));
    const keys = PALETTE.map((d) => d.key).filter((k) => k !== ''); // some have no shortcut
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
      // Above 0.5 a cell overshoots its neighbours' average, and heat sloshes back and forth between them.
      expect(def.conductivity, where).toBeLessThanOrEqual(0.5);
      expect(inRange(def.cooling), where).toBe(true);
      expect(inRange(def.wind), where).toBe(true);
      if (def.drifts !== undefined) expect(inRange(def.drifts) && def.kind === 'powder', where).toBe(true);
      if (def.heat) expect(inRange(def.heat.rate), where).toBe(true);
      if (def.ignitesAt !== undefined) expect(def.flammability, where).toBeGreaterThan(0);
      // Something that sets solid when cold must not also be produced by melting below that point.
      if (def.below && def.startTemp !== undefined) expect(def.startTemp, where).toBeGreaterThan(def.below.temp);
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

describe('dunes and drifts', () => {
  const pileCentre = (wind: number, m: MaterialId): number => {
    const w = new World(120, 40, 13);
    for (let x = 0; x < 120; x++) w.set(x, 39, M.Stone);
    for (let y = 30; y < 39; y++) for (let x = 30; x < 50; x++) w.set(x, y, m);
    w.wind = wind;
    for (let f = 0; f < 1500; f++) w.step();
    let n = 0;
    let sx = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === m) { n++; sx += i % 120; }
    return sx / n;
  };

  it('creep downwind in a strong wind, grain by grain; snow drifts faster than sand', () => {
    const still = pileCentre(0, M.Sand);
    expect(pileCentre(1, M.Sand) - still).toBeGreaterThan(3);
    expect(pileCentre(1, M.Snow) - pileCentre(0, M.Snow)).toBeGreaterThan(pileCentre(1, M.Sand) - still);
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

describe('sunlight', () => {
  function count(w: World, m: number): number {
    let n = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === m) n++;
    return n;
  }
  function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
    for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
  }

  it('warms the first thing it reaches, and nothing in its shade', () => {
    const w = new World(60, 40, 1);
    fill(w, 0, 30, 60, 10, M.Stone);
    fill(w, 30, 10, 30, 1, M.Stone); // a roof over the right half
    w.sun = 1;
    for (let f = 0; f < 1200; f++) w.step();
    expect(w.temp[30 * 60 + 10]).toBeGreaterThan(AMBIENT_TEMP + 10); // sunlit floor (it loses some into the rock)
    expect(w.temp[10 * 60 + 45]).toBeGreaterThan(AMBIENT_TEMP + 10); // the roof
    expect(w.temp[30 * 60 + 45]).toBeLessThan(AMBIENT_TEMP + 5); // floor in the roof's shade
    expect(w.temp[30 * 60 + 10]).toBeLessThanOrEqual(AMBIENT_TEMP + 28.01); // a hot summer surface, no more
  });

  it('shines through glass, like a greenhouse', () => {
    const w = new World(40, 40, 2);
    fill(w, 0, 30, 40, 10, M.Stone);
    fill(w, 0, 10, 40, 1, M.Glass);
    w.sun = 1;
    for (let f = 0; f < 1200; f++) w.step();
    expect(w.temp[30 * 40 + 20]).toBeGreaterThan(AMBIENT_TEMP + 10);
  });

  it('strong sun melts snow in the open but not in the shade; weak sun melts none', () => {
    const run = (sun: number): [number, number] => {
      const w = new World(80, 60, 3);
      fill(w, 0, 50, 80, 10, M.Stone);
      fill(w, 0, 44, 80, 6, M.Snow);
      fill(w, 40, 30, 40, 1, M.Stone);
      w.sun = sun;
      for (let f = 0; f < 1800; f++) w.step();
      let open = 0;
      let shade = 0;
      for (let y = 30; y < 50; y++) {
        for (let x = 0; x < 80; x++) {
          if (w.mat[y * 80 + x] !== M.Snow) continue;
          if (x < 36) open++;
          else if (x >= 44) shade++;
        }
      }
      return [open, shade];
    };
    const [open, shade] = run(1);
    expect(open).toBeLessThan(216 * 0.85);
    expect(shade).toBe(216);
    expect(run(0.5)).toEqual([216, 216]);
  });

  it('burns clouds off from the top, slowly enough that a cloud keeps its body for a while', () => {
    const run = (sun: number, frames: number): number => {
      const w = new World(80, 100, 4);
      fill(w, 0, 22, 80, 6, M.Cloud);
      w.sun = sun;
      for (let f = 0; f < frames; f++) w.step();
      return count(w, M.Cloud);
    };
    // After 10 seconds of strong sun most of the cloud is still there...
    expect(run(1, 600)).toBeGreaterThan(run(0, 600) * 0.8);
    // ...but after a minute the sun has burnt a good part of it away.
    expect(run(1, 3600)).toBeLessThan(run(0, 3600) * 0.6);
  });

  it('evaporates water into vapour, which rises and makes clouds: the water cycle', () => {
    const run = (sun: number): World => {
      const w = new World(120, 100, 5);
      fill(w, 0, 80, 120, 20, M.Water);
      w.sun = sun;
      for (let f = 0; f < 1800; f++) w.step();
      return w;
    };
    const sunny = run(0.5);
    expect(sunny.created[M.Vapour]).toBeGreaterThan(50);
    // Vapour condenses into cloud at the cloud layer, or into cirrus if it climbs above it.
    expect(sunny.created[M.Cloud] + sunny.created[M.Cirrus]).toBeGreaterThan(20);
    const dark = run(0);
    expect(dark.created[M.Vapour]).toBe(0);
    expect(dark.created[M.Cloud]).toBe(0);
  });

  it('dries salt water into salt, and mud into earth', () => {
    const w = new World(80, 40, 6);
    fill(w, 0, 36, 40, 4, M.SaltWater);
    fill(w, 40, 36, 40, 4, M.Mud);
    w.sun = 1;
    for (let f = 0; f < 3600; f++) w.step();
    expect(count(w, M.Salt)).toBeGreaterThan(20);
    expect(count(w, M.Earth)).toBeGreaterThan(40);
  });
});

describe('noise (audible events for the UI)', () => {
  it('counts explosions with their size, acid eating, and fireworks bursting', () => {
    const w = new World(40, 40, 10);
    w.explode(20, 20, 6);
    w.explode(10, 10, 3);
    expect(w.noise.blasts).toBe(2);
    expect(w.noise.blastRadius).toBe(6);
    for (let x = 0; x < 40; x++) w.set(x, 39, M.Sand);
    for (let x = 0; x < 40; x++) w.set(x, 38, M.Acid);
    for (let f = 0; f < 30; f++) w.step();
    expect(w.noise.fizzes).toBeGreaterThan(0);
    const f = new World(20, 40, 11);
    f.set(10, 35, M.Fireworks);
    f.ignite(f.idx(10, 35));
    for (let k = 0; k < 400 && f.noise.bursts === 0; k++) f.step();
    expect(f.noise.bursts).toBe(1);
  });
});

describe('lightning', () => {
  it('builds charge (corona) for most of a second before it strikes', () => {
    const w = new World(60, 120, 12);
    for (let y = 22; y < 42; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Cloud);
    let charging = -1;
    let struck = -1;
    for (let f = 0; f < 4000 && struck < 0; f++) {
      w.step();
      if (charging < 0 && w.noise.corona > 0) charging = f;
      if (w.noise.strikes > 0) struck = f;
      w.noise.corona = w.noise.strikes = 0;
    }
    expect(struck).toBeGreaterThan(0);
    expect(struck - charging).toBeGreaterThanOrEqual(39);
  });
});

describe('lightning rods', () => {
  it('draw strikes from a storm to themselves', () => {
    const w = new World(60, 120, 16);
    for (let y = 22; y < 52; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Cloud);
    for (let y = 100; y < 120; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Stone);
    for (let y = 60; y < 100; y++) w.set(30, y, M.Copper); // a copper spire
    let strikes = 0;
    let hits = 0;
    for (let f = 0; f < 3000; f++) {
      w.step();
      if (w.noise.strikes > 0) {
        strikes += w.noise.strikes;
        // Did this one land on the spire (a copper cell freshly charged)?
        for (let y = 50; y < 100; y++) if (w.mat[y * 60 + 30] === M.Copper && w.charge[y * 60 + 30] === CHARGE_ACTIVE) { hits++; break; }
      }
      w.noise.strikes = 0;
    }
    expect(strikes).toBeGreaterThan(4);
    // The rod reaches about 25 of the 60 columns, so roughly 40% of strikes: well over a fifth.
    expect(hits).toBeGreaterThan(strikes * 0.2);
    // And it survives them: lightning doesn't melt it away.
    let copper = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Copper) copper++;
    expect(copper).toBeGreaterThanOrEqual(38);
  });
});

describe('dynamo', () => {
  // A dynamo at the end of a copper wire; counts frames the middle of the wire is live.
  const pulses = (setup: (w: World) => void): number => {
    const w = new World(40, 30, 16);
    for (let x = 0; x < 40; x++) w.set(x, 29, M.Stone);
    w.set(5, 20, M.Dynamo);
    for (let x = 6; x < 30; x++) w.set(x, 20, M.Copper);
    setup(w);
    let n = 0;
    for (let f = 0; f < 600; f++) {
      w.step();
      if (w.charge[20 * 40 + 18] > 0) n++;
    }
    return n;
  };

  it('pulses a wire while the wind turns it, or water pours onto it', () => {
    expect(pulses((w) => (w.wind = 1))).toBeGreaterThan(10);
    // A water wheel, in still air: a tank on a shelf, draining through a hole above the dynamo.
    expect(
      pulses((w) => {
        for (let x = 0; x < 40; x++) w.set(x, 6, x === 5 ? M.Empty : M.Stone);
        for (let y = 0; y < 6; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Water);
      }),
    ).toBeGreaterThan(5);
  });

  it('stays still in still air, or walled in out of the wind', () => {
    expect(pulses(() => {})).toBe(0);
    expect(
      pulses((w) => {
        w.wind = 1;
        w.set(4, 20, M.Stone);
        w.set(5, 19, M.Stone);
      }),
    ).toBe(0);
  });
});

describe('electromagnet', () => {
  // A standing iron wire with iron filings lying beside it; returns how far the filings are from it.
  const spread = (powered: boolean): number => {
    const w = new World(40, 40, 17);
    for (let x = 0; x < 40; x++) w.set(x, 39, M.Stone);
    for (let y = 10; y < 39; y++) w.set(10, y, M.Iron);
    if (powered) w.set(9, 38, M.Battery);
    for (let x = 13; x < 20; x++) w.set(x, 38, M.IronFilings);
    for (let f = 0; f < 2000; f++) w.step();
    let n = 0;
    let d = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.IronFilings) { n++; d += Math.abs((i % 40) - 10); }
    return d / n;
  };

  it('a live iron wire pulls iron filings towards it; a dead one does not', () => {
    expect(spread(true)).toBeLessThan(spread(false) - 1);
  });
});

describe('solar cell', () => {
  const pulses = (sun: number, roof: MaterialId | null): number => {
    const w = new World(40, 30, 9);
    w.set(5, 20, M.SolarCell);
    for (let x = 6; x < 30; x++) w.set(x, 20, M.Copper);
    if (roof !== null) for (let x = 0; x < 40; x++) w.set(x, 10, roof);
    w.sun = sun;
    let n = 0;
    for (let f = 0; f < 600; f++) {
      w.step();
      if (w.charge[20 * 40 + 20] > 0) n++;
    }
    return n;
  };

  it('sends pulses along a wire while the sun shines on it, even through glass', () => {
    expect(pulses(1, null)).toBeGreaterThan(10);
    expect(pulses(1, M.Glass)).toBeGreaterThan(10);
    expect(pulses(0.5, null)).toBeLessThan(pulses(1, null));
  });

  it('does nothing in the shade or with the sun off', () => {
    expect(pulses(1, M.Stone)).toBe(0);
    expect(pulses(0, null)).toBe(0);
  });
});

describe('sunny plants', () => {
  // Grass on loam, the right half under a stone roof; returns grass grown in the open and in the
  // shade, added up over a few worlds (a single one is too noisy: from 7/14 to 12/8 with the sun off).
  const grow = (sun: number): [number, number] => {
    let open = 0;
    let shade = 0;
    for (let seed = 14; seed < 18; seed++) {
      const w = new World(80, 40, seed);
      for (let x = 0; x < 80; x++) {
        w.set(x, 39, M.Loam);
        w.set(x, 38, M.Loam);
      }
      for (let x = 40; x < 80; x++) w.set(x, 20, M.Stone);
      w.set(10, 37, M.Grass);
      w.set(60, 37, M.Grass);
      w.sun = sun;
      for (let f = 0; f < 1500; f++) w.step();
      for (let i = 0; i < w.size; i++) {
        if (w.mat[i] !== M.Grass) continue;
        if (i % 80 < 40) open++;
        else shade++;
      }
    }
    return [open, shade];
  };

  it('with the sun out, grow faster in sunlight than in shade', () => {
    const [open, shade] = grow(1);
    expect(open).toBeGreaterThan(shade * 1.5);
  });

  it('grow the same in sun and shade when the sun is off', () => {
    const [open, shade] = grow(0);
    expect(Math.abs(open - shade)).toBeLessThan(Math.max(open, shade) * 0.4);
  });
});

describe('sweets', () => {
  it('caramel sets into toffee as it cools, and toffee melts back above 100°', () => {
    const w = new World(20, 20, 18);
    for (let y = 15; y < 20; y++) for (let x = 0; x < 20; x++) w.set(x, y, M.Caramel);
    for (let f = 0; f < 1500; f++) w.step();
    let toffee = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Toffee) toffee++;
    expect(toffee).toBe(100);
    const i = w.idx(10, 17);
    w.temp[i] = 150;
    w.step();
    expect(w.mat[i]).toBe(M.Caramel);
  });

  it('seeds pop into popcorn that jumps into the air, and you can hear it', () => {
    const w = new World(40, 40, 19);
    for (let y = 31; y < 40; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Lava);
    for (let x = 0; x < 40; x++) w.set(x, 30, M.Stone);
    for (let x = 10; x < 30; x++) w.set(x, 29, M.Seed);
    let pops = 0;
    let highest = 40;
    for (let f = 0; f < 600; f++) {
      w.step();
      pops += w.noise.pops;
      w.noise.pops = 0;
      for (let k = 0; k < w.size; k++) if (w.mat[k] === M.Popcorn) highest = Math.min(highest, Math.floor(k / 40));
    }
    expect(pops).toBeGreaterThan(10);
    expect(highest).toBeLessThan(26); // well up above the plate it popped on
  });
});

describe('icicles', () => {
  it('grow where water drips past ice, but not under the ice of a frozen pond', () => {
    const drip = new World(40, 40, 20);
    for (let x = 0; x < 40; x++) if (x < 18 || x > 22) drip.set(x, 10, M.Ice);
    for (let y = 5; y < 10; y++) for (let x = 0; x < 40; x++) drip.set(x, y, M.Water);
    const pond = new World(40, 40, 20);
    for (let y = 20; y < 40; y++) for (let x = 0; x < 40; x++) pond.set(x, y, M.Water);
    for (let x = 0; x < 40; x++) pond.set(x, 19, M.Ice);
    for (let f = 0; f < 600; f++) {
      drip.step();
      pond.step();
    }
    const count = (w: World): number => w.mat.reduce((n, m) => n + (m === M.Icicle ? 1 : 0), 0);
    expect(count(drip)).toBeGreaterThan(2);
    expect(count(pond)).toBe(0);
  });
});

describe('garden', () => {
  it('a seed on fertiliser grows into a tree with no water anywhere; on dry earth it waits', () => {
    const grow = (ground: MaterialId): number => {
      const w = new World(40, 60, 21);
      for (let x = 0; x < 40; x++) w.set(x, 59, ground);
      w.set(20, 58, M.Seed);
      for (let f = 0; f < 2000; f++) w.step();
      return w.created[M.Wood];
    };
    expect(grow(M.Fertiliser)).toBeGreaterThan(5);
    expect(grow(M.Earth)).toBe(0);
  });

  it('compost rots down into loam', () => {
    const w = new World(20, 20, 22);
    for (let y = 16; y < 20; y++) for (let x = 0; x < 20; x++) w.set(x, y, M.Compost);
    for (let f = 0; f < 3200; f++) w.step();
    let loam = 0;
    let compost = 0;
    for (let i = 0; i < w.size; i++) {
      if (w.mat[i] === M.Loam) loam++;
      else if (w.mat[i] === M.Compost) compost++;
    }
    expect(compost).toBe(0);
    expect(loam).toBe(80);
  });
});

describe('paint and neon', () => {
  it('red paint dries where it lies', () => {
    const w = new World(20, 20, 23);
    for (let x = 0; x < 20; x++) w.set(x, 19, M.RedPaint);
    for (let f = 0; f < 1000; f++) w.step();
    let dried = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.DriedPaint) dried++;
    expect(dried).toBe(20);
  });

  it('neon in a glass tube carries pulses from a battery', () => {
    const w = new World(30, 10, 24);
    for (let x = 0; x < 30; x++) {
      w.set(x, 3, M.Glass);
      w.set(x, 5, M.Glass);
      w.set(x, 4, M.Neon);
    }
    w.set(0, 4, M.Battery);
    let lit = 0;
    for (let f = 0; f < 600; f++) {
      w.step();
      if (w.charge[w.idx(15, 4)] > 0 && w.mat[w.idx(15, 4)] === M.Neon) lit++;
    }
    expect(lit).toBeGreaterThan(5);
  });
});

describe('vents', () => {
  const count = (w: World, m: number): number => w.mat.reduce((n, v) => n + (v === m ? 1 : 0), 0);

  it('a spring trickles water until its reservoir is spent, then turns to stone', () => {
    const w = new World(30, 30, 25);
    for (let x = 0; x < 30; x++) w.set(x, 29, M.Stone);
    w.set(15, 28, M.Spring);
    w.step();
    const i = w.idx(15, 28);
    w.life[i] = 21; // twenty cells left in the aquifer
    for (let f = 0; f < 3000; f++) w.step();
    expect(w.mat[i]).toBe(M.Stone);
    expect(w.created[M.Water]).toBe(20);
  });

  it('only release into open air: a vent sealed in rock is silent', () => {
    const w = new World(10, 10, 26);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) w.set(x, y, M.Stone);
    w.set(5, 5, M.GasVent);
    for (let f = 0; f < 1000; f++) w.step();
    expect(w.created[M.SwampGas]).toBe(0);
    expect(w.mat[w.idx(5, 5)]).toBe(M.GasVent);
  });

  it('a gusher shoots oil high into the air', () => {
    const w = new World(40, 60, 27);
    for (let x = 0; x < 40; x++) w.set(x, 59, M.Stone);
    w.set(20, 58, M.Gusher);
    let highest = 60;
    for (let f = 0; f < 1500; f++) {
      w.step();
      for (let k = 0; k < w.size; k++) if (w.mat[k] === M.Oil) highest = Math.min(highest, Math.floor(k / 40));
    }
    expect(highest).toBeLessThan(45);
  });

  it('a spring fills its own pond: it keeps flowing up through the water above it', () => {
    const w = new World(20, 30, 28);
    for (let y = 0; y < 30; y++) {
      w.set(0, y, M.Stone);
      w.set(19, y, M.Stone);
    }
    for (let x = 0; x < 20; x++) w.set(x, 29, M.Stone);
    w.set(10, 28, M.Spring);
    for (let f = 0; f < 4000; f++) w.step();
    expect(count(w, M.Water)).toBeGreaterThan(80); // several rows deep over the spring
  });

  it('all together release no more than the per-frame budget', () => {
    const w = new World(100, 40, 29);
    for (let x = 0; x < 100; x++) {
      w.set(x, 39, M.Stone);
      w.set(x, 38, M.VolcanicVent);
    }
    let worst = 0;
    let last = 0;
    for (let f = 0; f < 200; f++) {
      w.step();
      worst = Math.max(worst, w.created[M.Lava] - last);
      last = w.created[M.Lava];
    }
    expect(worst).toBeLessThanOrEqual(48);
    expect(last).toBeGreaterThan(48);
  });

  it('a pot boiled over a wood fire does not open a fumarole', () => {
    const w = new World(40, 40, 3);
    for (let x = 10; x < 30; x++) w.set(x, 30, M.Stone);
    for (let y = 20; y < 30; y++) {
      w.set(10, y, M.Stone);
      w.set(29, y, M.Stone);
    }
    for (let y = 22; y < 30; y++) for (let x = 11; x < 29; x++) w.set(x, y, M.Water);
    for (let y = 31; y < 40; y++) for (let x = 8; x < 32; x++) w.set(x, y, M.Wood);
    for (let x = 8; x < 32; x++) w.ignite(w.idx(x, 39));
    for (let f = 0; f < 3000; f++) w.step();
    expect(w.created[M.Steam]).toBeGreaterThan(100);
    expect(w.created[M.Fumarole]).toBe(0);
  });

  it('a sinkhole drains a pool', () => {
    const w = new World(20, 20, 30);
    for (let y = 0; y < 20; y++) {
      w.set(0, y, M.Stone);
      w.set(19, y, M.Stone);
    }
    for (let x = 0; x < 20; x++) w.set(x, 19, M.Stone);
    w.set(10, 19, M.Sinkhole);
    for (let y = 14; y < 19; y++) for (let x = 1; x < 19; x++) w.set(x, y, M.Water);
    for (let f = 0; f < 3000; f++) w.step();
    expect(count(w, M.Water)).toBe(0);
  });
});

describe('ants, yeast and coral', () => {
  const count = (w: World, m: number): number => w.mat.reduce((n, v) => n + (v === m ? 1 : 0), 0);

  it('ants dig into the earth and carry the grains up into anthills', () => {
    const w = new World(60, 40, 31);
    for (let y = 25; y < 40; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Earth);
    for (let x = 10; x < 60; x += 10) w.set(x, 24, M.Ant);
    for (let x = 3; x < 60; x += 6) w.set(x, 24, M.Sugar); // something to eat
    for (let f = 0; f < 4000; f++) w.step();
    let heaped = 0;
    let below = 0;
    for (let y = 0; y < 25; y++) for (let x = 0; x < 60; x++) if (w.mat[y * 60 + x] === M.Earth) heaped++;
    for (let y = 26; y < 40; y++) for (let x = 0; x < 60; x++) if (w.mat[y * 60 + x] === M.Ant) below++;
    expect(heaped).toBeGreaterThan(3); // mounds above the old ground level (loose earth slumps, so they stay small)
    expect(below).toBeGreaterThan(0); // and ants down in the earth, digging
  });

  it('yeast ferments sugar into alcohol and carbon dioxide; sugar water alone does not', () => {
    const brew = (yeast: boolean): World => {
      const w = new World(30, 30, 32);
      for (let y = 15; y < 30; y++) for (let x = 0; x < 30; x++) w.set(x, y, M.Water);
      for (let x = 0; x < 30; x++) w.set(x, 29, M.Sugar);
      if (yeast) for (let x = 2; x < 30; x += 4) w.set(x, 27, M.Yeast);
      for (let f = 0; f < 3000; f++) w.step();
      return w;
    };
    const brewed = brew(true);
    expect(brewed.created[M.Alcohol]).toBeGreaterThan(3);
    expect(brewed.created[M.CarbonDioxide]).toBeGreaterThan(3);
    const plain = brew(false);
    expect(plain.created[M.Alcohol]).toBe(0);
  });

  it('yeast dies away with no sugar', () => {
    const w = new World(20, 20, 33);
    for (let y = 5; y < 20; y++) for (let x = 0; x < 20; x++) w.set(x, y, M.Water);
    for (let x = 2; x < 20; x += 3) w.set(x, 12, M.Yeast);
    for (let f = 0; f < 4000; f++) w.step();
    expect(count(w, M.Yeast)).toBe(0);
  });

  it('a coral polyp builds a reef in salt water, and bleaches when the water gets too hot', () => {
    const w = new World(40, 40, 34);
    for (let y = 10; y < 40; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.SaltWater);
    w.set(20, 30, M.CoralPolyp);
    for (let f = 0; f < 4000; f++) w.step();
    expect(count(w, M.CoralRock)).toBeGreaterThan(5);
    expect(count(w, M.CoralPolyp)).toBeGreaterThan(0);
    const hot = new World(10, 10, 35);
    for (let i = 0; i < hot.size; i++) hot.setCell(i, M.SaltWater);
    const p = hot.idx(5, 5);
    hot.setCell(p, M.CoralPolyp);
    hot.temp[p] = 50;
    hot.step();
    expect(hot.mat[p]).toBe(M.CoralRock);
  });
});

describe('wind and life', () => {
  it('flowers in the wind send seeds off downwind', () => {
    const blow = (wind: number): number => {
      const w = new World(80, 30, 36);
      for (let x = 0; x < 80; x++) w.set(x, 29, M.Stone);
      for (let x = 10; x < 20; x++) w.set(x, 20, M.Flower);
      w.wind = wind;
      for (let f = 0; f < 3000; f++) w.step();
      let far = 0;
      for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Seed && i % 80 > 25) far++;
      return far;
    };
    expect(blow(1)).toBeGreaterThan(2);
    expect(blow(0)).toBe(0);
  });

  it('a fire races along before the wind', () => {
    const burn = (wind: number): number => {
      const w = new World(100, 20, 37);
      for (let x = 0; x < 100; x++) {
        w.set(x, 19, M.Stone);
        w.set(x, 18, M.Wood);
      }
      w.ignite(w.idx(0, 18));
      w.wind = wind;
      for (let f = 0; f < 400; f++) w.step();
      let reach = 0;
      for (let x = 0; x < 100; x++) if (w.mat[18 * 100 + x] !== M.Wood || w.burn[18 * 100 + x] > 0) reach = x;
      return reach;
    };
    expect(burn(1)).toBeGreaterThan(burn(0) * 1.3);
  });
});

describe('circuits: accumulator, thermocouple, heat lamp', () => {
  it('an accumulator charged by a solar cell keeps a wire pulsing after the sun goes', () => {
    const night = (withAccumulator: boolean): number => {
      const w = new World(40, 30, 38);
      w.set(5, 20, M.SolarCell);
      for (let x = 6; x < 35; x++) w.set(x, 20, M.Copper);
      if (withAccumulator) w.set(10, 20, M.Accumulator);
      w.sun = 1;
      for (let f = 0; f < 2000; f++) w.step();
      w.sun = 0;
      let pulses = 0;
      for (let f = 0; f < 800; f++) {
        w.step();
        if (w.charge[w.idx(25, 20)] === CHARGE_ACTIVE) pulses++;
      }
      return pulses;
    };
    expect(night(true)).toBeGreaterThan(3);
    expect(night(false)).toBe(0);
  });

  it('a thermocouple pulses while one side is far hotter than the other', () => {
    const pulses = (hot: boolean): number => {
      const w = new World(40, 30, 39);
      w.set(10, 20, M.Thermocouple);
      // A cup of lava against its left side (or an empty cup).
      w.set(8, 20, M.Stone);
      w.set(8, 21, M.Stone);
      w.set(9, 21, M.Stone);
      w.set(10, 21, M.Stone);
      if (hot) w.set(9, 20, M.Lava);
      for (let x = 11; x < 35; x++) w.set(x, 20, M.Copper);
      let n = 0;
      for (let f = 0; f < 600; f++) {
        w.step();
        if (w.charge[w.idx(25, 20)] === CHARGE_ACTIVE) n++;
      }
      return n;
    };
    expect(pulses(true)).toBeGreaterThan(3);
    expect(pulses(false)).toBe(0);
  });

  it("a heat lamp's warmth fades with distance", () => {
    const warmth = (gap: number): number => {
      const w = new World(40, 130, 43);
      for (let x = 0; x < 40; x++) w.set(x, 129, M.Stone);
      w.set(20, 128 - gap, M.HeatLamp);
      w.set(19, 128 - gap, M.Battery);
      for (let f = 0; f < 800; f++) w.step();
      let hottest = 0;
      for (let x = 0; x < 40; x++) hottest = Math.max(hottest, w.temp[w.idx(x, 129)]);
      return hottest;
    };
    expect(warmth(10)).toBeGreaterThan(warmth(110) + 30);
  });

  it('a powered heat lamp melts the ice beneath it; an unpowered one does not', () => {
    const ice = (powered: boolean): number => {
      // A lamp about ten cells above a small block of ice.
      const w = new World(30, 40, 40);
      w.set(15, 25, M.HeatLamp);
      if (powered) w.set(14, 25, M.Battery);
      for (let x = 0; x < 30; x++) w.set(x, 39, M.Stone);
      for (let y = 36; y < 39; y++) for (let x = 13; x < 18; x++) w.set(x, y, M.Ice);
      for (let f = 0; f < 2000; f++) w.step();
      let n = 0;
      for (let y = 30; y < 39; y++) if (w.mat[w.idx(15, y)] === M.Ice) n++;
      return n;
    };
    expect(ice(true)).toBeLessThan(3);
    expect(ice(false)).toBe(3);
  });
});

describe('creatures and the elements', () => {
  it('a fish at the edge of a blast is stunned and floats up, then comes round', () => {
    const w = new World(40, 40, 41);
    for (let y = 10; y < 40; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Water);
    w.set(20, 35, M.Fish);
    w.explode(20, 26, 6);
    let fish = -1;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Fish) fish = i;
    expect(fish).toBeGreaterThanOrEqual(0);
    expect(w.vel[fish]).toBeGreaterThan(0);
    for (let f = 0; f < 300; f++) w.step();
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Fish) expect(w.vel[i]).toBe(0);
  });

  it('a dry snail in strong sun withdraws into its shell; in shade it crawls', () => {
    const moved = (sun: number): boolean => {
      const w = new World(40, 30, 42);
      for (let x = 0; x < 40; x++) w.set(x, 29, M.Stone);
      w.set(20, 28, M.Snail);
      w.sun = sun;
      for (let f = 0; f < 400; f++) w.step();
      return w.mat[w.idx(20, 28)] !== M.Snail;
    };
    expect(moved(1)).toBe(false);
    expect(moved(0)).toBe(true);
  });
});

describe('rain', () => {
  it('is the cloud itself coming down, never water from nowhere', () => {
    // A storm-deep cloud (30 rows) pours; every drop costs a cloud cell, so water plus whatever is
    // still cloud or vapour never exceeds the cloud it started as.
    const w = new World(60, 80, 7);
    for (let y = 10; y < 40; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Cloud);
    for (let f = 0; f < 3000; f++) w.step();
    let water = 0, airborne = 0;
    for (let i = 0; i < w.size; i++) {
      const m = w.mat[i];
      if (m === M.Water) water++;
      else if (m === M.Cloud || m === M.StormCloud || m === M.Cirrus || m === M.Vapour || m === M.Steam) airborne++;
    }
    expect(water).toBeGreaterThan(300);
    expect(water + airborne).toBeLessThanOrEqual(1800);
  });

  it('pours from a thick cloud, which rains itself thinner from the bottom up', () => {
    const rain = (rows: number): number => {
      const w = new World(60, 140, 8);
      for (let y = 30; y < 30 + rows; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Cloud);
      for (let f = 0; f < 300; f++) w.step();
      return w.created[M.Water];
    };
    expect(rain(40)).toBeGreaterThan(rain(6) * 3);
  });
});


describe('clouds', () => {
  function count(w: World, m: number): number {
    let n = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === m) n++;
    return n;
  }
  it('a fair-weather cloud keeps its body and gathers into a heap: flat base, domed top, no lightning', () => {
    // Clouds used to have a lifetime and pour from any depth, so a cloud this size was gone in
    // 20 seconds. Now it sits on the cloud base, only drizzling, and heaps up like cumulus.
    const w = new World(80, 80, 1);
    for (let y = 14; y < 24; y++) for (let x = 0; x < 80; x++) w.set(x, y, M.Cloud);
    run(w, 1800);
    expect(count(w, M.Cloud)).toBeGreaterThan(800 * 0.85);
    const column = (x: number): number => {
      let n = 0;
      for (let y = 0; y < 80; y++) if (w.get(x, y) === M.Cloud) n++;
      return n;
    };
    // Domed: thick in the middle, thin at the edges.
    expect(column(40)).toBeGreaterThan(column(8) + 5);
    expect(column(40)).toBeGreaterThan(column(72) + 5);
    // Flat underneath: its base is level to within a few rows across the middle of the heap.
    const baseOf = (x: number): number => {
      for (let y = 79; y >= 0; y--) if (w.get(x, y) === M.Cloud) return y;
      return -1;
    };
    const bases = [25, 32, 40, 48, 55].map(baseOf);
    expect(Math.max(...bases) - Math.min(...bases)).toBeLessThanOrEqual(3);
    expect(w.created[M.StormCloud]).toBe(0);
    expect(w.noise.strikes).toBe(0);
  });

  it('a deep cloud grows a storm base that pours, then clears to fair-weather cloud', { timeout: 20000 }, () => {
    const w = new World(60, 120, 1);
    for (let y = 15; y < 55; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Cloud);
    run(w, 300);
    expect(count(w, M.StormCloud)).toBeGreaterThan(600);
    run(w, 2700);
    expect(w.created[M.Water]).toBeGreaterThan(1000);
    expect(w.noise.strikes).toBeGreaterThan(0);
    // (Torn-off wisps go back to vapour and recondense rather than vanishing, so it takes a while.)
    run(w, 4500);
    expect(count(w, M.StormCloud)).toBeLessThan(30);
    // What's left is a fair-weather cloud of real depth (at least eight rows across 60 columns),
    // not a wisp.
    expect(count(w, M.Cloud)).toBeGreaterThan(8 * 60);
  });

  it('strikes come one at a time, however big the storm', () => {
    const w = new World(200, 120, 2);
    for (let y = 10; y < 60; y++) for (let x = 0; x < 200; x++) w.set(x, y, M.Cloud);
    run(w, 600);
    // At least 40 frames between one strike charging and the next.
    expect(w.noise.strikes).toBeLessThanOrEqual(600 / 40);
    expect(w.noise.strikes).toBeGreaterThan(0);
  });

  it('vapour climbing above the cloud layer becomes cirrus, which never rains and fades', () => {
    const w = new World(60, 80, 1);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Vapour);
    run(w, 600);
    expect(count(w, M.Cirrus)).toBe(120);
    run(w, 6000);
    expect(count(w, M.Cirrus)).toBeLessThan(10);
    expect(w.created[M.Water]).toBe(0);
  });

  it('lone wisps of cloud evaporate back into vapour, which gathers at the cloud layer', () => {
    const w = new World(80, 80, 1);
    for (let k = 0; k < 40; k++) w.set(4 + (k % 20) * 4, 30 + Math.floor(k / 20) * 10, M.Cloud);
    run(w, 1200);
    // No specks are left where they were...
    let low = 0;
    for (let y = 25; y < 80; y++) for (let x = 0; x < 80; x++) if (w.get(x, y) === M.Cloud) low++;
    expect(low).toBe(0);
    // ...they went back to vapour (water isn't lost), and what gathered recondensed up high.
    expect(w.created[M.Vapour]).toBeGreaterThan(30);
    expect(count(w, M.Cloud) + count(w, M.Vapour)).toBeLessThanOrEqual(40);
  });
});

describe('day and night', () => {
  function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
    for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
  }

  it('the sun rises, peaks at midday, sets, and the night is coldest at midnight', () => {
    const day = 1000;
    expect(sunAt(0, day)).toBe(0);
    expect(sunAt(250, day)).toBe(1);
    expect(sunAt(100, day)).toBeGreaterThan(0.8); // mid-morning is already bright
    expect(sunAt(750, day)).toBe(-1);
    expect(sunAt(600, day)).toBeLessThan(-0.8);
    expect(sunAt(1250, day)).toBe(1); // and again the next day
    const w = new World(10, 10, 1);
    w.dayLength = day;
    for (let f = 0; f < 250; f++) w.step();
    expect(w.sun).toBeGreaterThan(0.99);
    for (let f = 0; f < 500; f++) w.step();
    expect(w.sun).toBeLessThan(-0.99);
  });

  it('a clear night chills open ground below freezing; under a cloud it stays warm', () => {
    const w = new World(60, 60, 1);
    // (Earth: bare stone holds more heat and stays above freezing through a night.)
    fill(w, 0, 45, 60, 15, M.Earth);
    fill(w, 30, 25, 30, 10, M.Cloud);
    w.sun = -1;
    // (Measured before the cloud's drizzle spreads across the flat ground as a puddle.)
    run(w, 450);
    expect(w.temp[45 * 60 + 10]).toBeLessThan(0);
    expect(w.temp[45 * 60 + 45]).toBeGreaterThan(AMBIENT_TEMP - 3);
  });

  it('mist rises off a pond on a clear night and it skins over with thin ice; the morning sun clears both', () => {
    const w = new World(60, 60, 1);
    fill(w, 0, 50, 60, 10, M.Stone);
    fill(w, 0, 44, 60, 6, M.Water);
    w.sun = -1;
    run(w, 1800);
    expect(w.created[M.Fog]).toBeGreaterThan(10);
    expect(w.count(M.ThinIce)).toBeGreaterThan(10);
    // Only a skin: most of the pond stays liquid.
    expect(w.count(M.Water)).toBeGreaterThan(200);
    w.sun = 1;
    run(w, 1800);
    expect(w.count(M.ThinIce)).toBe(0);
    expect(w.count(M.Fog)).toBe(0);
  });

  it('a pond on an ordinary day, or with the sun off, neither mists nor freezes', () => {
    for (const sun of [0, 1]) {
      const w = new World(60, 60, 1);
      fill(w, 0, 50, 60, 10, M.Stone);
      fill(w, 0, 44, 60, 6, M.Water);
      w.sun = sun;
      run(w, 1800);
      expect(w.created[M.Fog]).toBe(0);
      expect(w.created[M.ThinIce]).toBe(0);
    }
  });

  it('thin ice holds no cold of its own: left at room temperature it melts', () => {
    const w = new World(30, 30, 1);
    fill(w, 0, 20, 30, 10, M.Water);
    fill(w, 0, 19, 30, 1, M.ThinIce);
    run(w, 600);
    expect(w.count(M.ThinIce)).toBe(0);
  });

  it('freezing fog settling on frozen ground leaves frost; on warm ground it does not', () => {
    const frost = (groundTemp: number): number => {
      const w = new World(40, 30, 1);
      fill(w, 0, 20, 40, 10, M.Stone);
      fill(w, 0, 18, 40, 2, M.Fog);
      for (let x = 0; x < 40; x++) w.temp[20 * 40 + x] = groundTemp;
      // Keep the ground at that temperature, as a long clear night would.
      for (let f = 0; f < 120; f++) {
        for (let x = 0; x < 40; x++) w.temp[20 * 40 + x] = groundTemp;
        w.step();
      }
      return w.count(M.Frost);
    };
    expect(frost(-6)).toBeGreaterThan(10);
    expect(frost(AMBIENT_TEMP)).toBe(0);
  });

  it('fog evaporates into water vapour rather than vanishing', () => {
    const w = new World(40, 40, 1);
    fill(w, 0, 30, 40, 10, M.Stone);
    fill(w, 0, 28, 40, 2, M.Fog);
    run(w, 1300);
    expect(w.count(M.Fog)).toBe(0);
    expect(w.created[M.Vapour]).toBeGreaterThan(60);
  });

  it('gusty wind swells and drops, and now and then turns round', () => {
    let min = 0, max = 0, strong = 0, calm = 0;
    for (let f = 0; f < 20000; f++) {
      const g = gustAt(f);
      min = Math.min(min, g);
      max = Math.max(max, g);
      if (Math.abs(g) > 0.6) strong++;
      if (Math.abs(g) < 0.15) calm++;
    }
    expect(max).toBeGreaterThan(0.9);
    expect(min).toBeLessThan(-0.9);
    expect(strong).toBeGreaterThan(2000);
    expect(calm).toBeGreaterThan(500);
    const w = new World(10, 10, 1);
    w.gusty = true;
    run(w, 700);
    expect(w.wind).toBeCloseTo(gustAt(700), 5);
  });
});

describe('open edges', () => {
  function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
    for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
  }

  it('with walls (the default) sand piles up on the bottom; with open edges it falls out', () => {
    for (const open of [false, true]) {
      const w = new World(40, 40, 1);
      w.openEdges = open;
      fill(w, 15, 5, 10, 10, M.Sand);
      run(w, 300);
      if (open) expect(w.count(M.Sand)).toBe(0);
      else expect(w.count(M.Sand)).toBe(100);
    }
  });

  it('a floor you draw still holds things up with open edges', () => {
    const w = new World(40, 40, 1);
    w.openEdges = true;
    fill(w, 5, 30, 30, 2, M.Stone);
    fill(w, 15, 10, 10, 5, M.Sand);
    run(w, 400);
    expect(w.count(M.Sand)).toBe(50);
    expect(w.count(M.Stone)).toBe(60);
  });

  it('water flows out of an open side; smoke rises out of the top', () => {
    const w = new World(40, 40, 1);
    w.openEdges = true;
    fill(w, 0, 35, 40, 5, M.Stone);
    fill(w, 0, 30, 20, 5, M.Water);
    fill(w, 25, 5, 5, 5, M.Smoke);
    run(w, 600);
    expect(w.count(M.Water)).toBeLessThan(20);
    expect(w.count(M.Smoke)).toBe(0);
  });

  it('clouds leave only by the side the wind blows them towards', () => {
    const calm = new World(80, 80, 1);
    calm.openEdges = true;
    fill(calm, 0, 14, 80, 6, M.Cloud);
    run(calm, 600);
    expect(calm.count(M.Cloud)).toBeGreaterThan(400);
    const windy = new World(80, 80, 1);
    windy.openEdges = true;
    windy.wind = 1;
    fill(windy, 0, 14, 80, 6, M.Cloud);
    run(windy, 1200);
    expect(windy.count(M.Cloud)).toBeLessThan(40);
    // Blown off the edge, not rained out against it.
    expect(windy.created[M.Water]).toBeLessThan(100);
  });
});

describe('heat conduction', () => {
  it('metals carry heat through a thick plate better than stone, and brick hardly at all', () => {
    const topOf = (m: MaterialId): number => {
      const w = new World(40, 40, 1);
      for (let y = 34; y < 40; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Lava);
      for (let y = 29; y < 34; y++) for (let x = 0; x < 40; x++) w.set(x, y, m);
      run(w, 1800);
      return w.temp[29 * 40 + 20];
    };
    const copper = topOf(M.Copper);
    const tin = topOf(M.Tin);
    const stone = topOf(M.Stone);
    const brick = topOf(M.Brick);
    expect(copper).toBeGreaterThan(tin);
    expect(tin).toBeGreaterThan(stone + 20);
    // Five cells of tin over lava is still hot enough to pop seeds (180°) on top.
    expect(tin).toBeGreaterThan(180);
    expect(brick).toBeLessThan(AMBIENT_TEMP + 40);
  });
});

describe('after the storm', () => {
  function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
    for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
  }

  it('lightning striking soil leaves saltpetre (nitrates), and grass spreads faster on it', { timeout: 20000 }, () => {
    const w = new World(60, 120, 3);
    fill(w, 0, 112, 60, 8, M.Loam);
    fill(w, 0, 15, 60, 40, M.Cloud);
    for (let f = 0; f < 4000 && w.created[M.Saltpetre] === 0; f++) w.step();
    expect(w.noise.strikes).toBeGreaterThan(0);
    expect(w.created[M.Saltpetre]).toBeGreaterThan(0);
    const spread = (under: MaterialId): number => {
      const g = new World(40, 20, 4);
      fill(g, 0, 19, 40, 1, under);
      fill(g, 0, 18, 40, 1, M.Loam);
      g.set(20, 17, M.Grass);
      run(g, 1200);
      return g.count(M.Grass);
    };
    expect(spread(M.Saltpetre)).toBeGreaterThan(spread(M.Stone));
  });

  it('earthworms come up to the surface when rain soaks the ground, and survive there', () => {
    const surfaced = (rain: boolean): number => {
      const w = new World(40, 40, 5);
      fill(w, 0, 28, 40, 12, M.Loam);
      for (let x = 2; x < 40; x += 4) w.set(x, 36, M.Earthworm);
      for (let f = 0; f < 900; f++) {
        if (rain && f % 6 === 0) w.set(w.rng.int(0, 39), 0, M.Water);
        w.step();
      }
      let n = 0;
      for (let y = 0; y < 31; y++) for (let x = 0; x < 40; x++) if (w.get(x, y) === M.Earthworm) n++;
      return n;
    };
    expect(surfaced(true)).toBeGreaterThan(surfaced(false) + 3);
  });

  it('mushrooms sprout on wet loam in the shade, not in strong sun or on dry loam, and rot into compost', () => {
    const sprouts = (sun: number, wet: boolean): World => {
      const w = new World(60, 30, 6);
      fill(w, 0, 24, 60, 6, M.Loam);
      if (wet) for (let x = 0; x < 60; x += 2) w.set(x, 23, M.Water);
      w.sun = sun;
      run(w, 1500);
      return w;
    };
    expect(sprouts(0, true).created[M.Mushroom]).toBeGreaterThan(2);
    expect(sprouts(1, true).created[M.Mushroom]).toBe(0);
    expect(sprouts(0, false).created[M.Mushroom]).toBe(0);
    const w = new World(10, 10, 7);
    w.set(5, 9, M.Stone);
    w.set(5, 8, M.Mushroom);
    run(w, 3700);
    expect(w.count(M.Mushroom)).toBe(0);
    expect(w.count(M.Compost)).toBe(1);
  });

  it('a solar still: a shallow tray of salt water under glass in the sun gives fresh water and leaves salt', { timeout: 20000 }, () => {
    const w = new World(40, 40, 8);
    fill(w, 0, 36, 40, 4, M.Stone);
    fill(w, 0, 33, 40, 3, M.SaltWater);
    fill(w, 0, 20, 40, 1, M.Glass);
    w.sun = 1;
    run(w, 3000);
    expect(w.created[M.Water]).toBeGreaterThan(20);
    expect(w.count(M.Salt)).toBeGreaterThan(5);
  });

  it('the sea in the sun evaporates without filling up with salt (it stays dissolved in deep water)', { timeout: 20000 }, () => {
    const w = new World(40, 40, 9);
    fill(w, 0, 36, 40, 4, M.Stone);
    fill(w, 0, 20, 40, 16, M.SaltWater);
    w.sun = 1;
    run(w, 3000);
    expect(w.created[M.Vapour]).toBeGreaterThan(20);
    // (Before, the same sea left a grain of salt for every other cell that evaporated.)
    expect(w.count(M.Salt)).toBeLessThan(4);
  });
});

describe('birds', () => {
  function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
    for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
  }

  it('a seagull dives for fish and eats them', () => {
    const w = new World(40, 40, 1);
    fill(w, 0, 28, 40, 12, M.Water);
    for (let x = 3; x < 40; x += 5) w.set(x, 29, M.Fish);
    w.set(20, 18, M.Seagull);
    const fish = w.count(M.Fish);
    run(w, 1500);
    expect(w.count(M.Fish)).toBeLessThan(fish);
    expect(w.count(M.Seagull)).toBeGreaterThan(0);
  });

  it('a crow swoops on a worm out on the surface and eats it', () => {
    const w = new World(40, 40, 2);
    fill(w, 0, 30, 40, 10, M.Loam);
    for (let x = 4; x < 40; x += 8) w.set(x, 30, M.Earthworm);
    w.set(20, 22, M.Crow);
    run(w, 1500);
    expect(w.count(M.Earthworm)).toBeLessThan(5);
  });

  it('with nothing to eat, a bird starves within a minute or so and falls as compost', () => {
    for (const bird of [M.Seagull, M.Crow]) {
      const w = new World(30, 30, 3);
      fill(w, 0, 28, 30, 2, M.Stone);
      w.set(15, 10, bird);
      run(w, 3700);
      expect(w.count(bird)).toBe(0);
      expect(w.count(M.Compost)).toBe(1);
    }
  });

  it('no birds come to plain water or bare soil', () => {
    const w = new World(40, 40, 4);
    fill(w, 0, 30, 20, 10, M.Water);
    fill(w, 20, 30, 20, 10, M.Loam);
    run(w, 3000);
    expect(w.created[M.Seagull] + w.created[M.Crow]).toBe(0);
  });
});

describe('after a fire', () => {
  function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
    for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
  }

  it('a burning tree crown drops pine cones, which ride out the fire and open into seeds once it has passed', () => {
    const w = new World(60, 50, 1);
    fill(w, 0, 44, 60, 6, M.Earth);
    fill(w, 29, 26, 2, 18, M.Wood);
    fill(w, 14, 10, 32, 16, M.Leaf);
    for (let x = 14; x < 46; x++) w.ignite(w.idx(x, 25));
    run(w, 600);
    expect(w.created[M.PineCone]).toBeGreaterThan(3);
    run(w, 1800);
    // The cones have opened without their seeds popping in the heat, and the seeds have grown into
    // young pines. (Those can catch from the still-smouldering trunk and drop cones of their own, so
    // cones may still be about.)
    expect(w.created[M.Seed]).toBeGreaterThan(3);
    expect(w.created[M.Needles]).toBeGreaterThan(0);
  });

  it('wood (a plank, a house) burning drops no cones: only a crown does', () => {
    const w = new World(40, 40, 2);
    fill(w, 0, 36, 40, 4, M.Stone);
    fill(w, 5, 26, 30, 10, M.Wood);
    for (let x = 5; x < 35; x++) w.ignite(w.idx(x, 26));
    run(w, 2000);
    expect(w.created[M.PineCone]).toBe(0);
  });

  it('seeds in smoke sprout sooner (smoke-cued germination)', () => {
    const sprouted = (smoky: boolean): number => {
      let n = 0;
      for (let seed = 5; seed < 9; seed++) {
        const w = new World(30, 30, seed);
        fill(w, 0, 26, 30, 4, M.Loam);
        for (let x = 2; x < 30; x += 4) w.set(x, 25, M.Seed);
        for (let f = 0; f < 15; f++) {
          // Keep a haze of smoke beside each seed.
          if (smoky) for (let x = 2; x < 30; x += 4) if (w.get(x + 1, 25) === M.Empty) w.set(x + 1, 25, M.Smoke);
          w.step();
        }
        // Seeds that have started to grow: no longer a dormant seed (one with no height yet).
        for (let x = 2; x < 30; x += 4) if (w.get(x, 25) !== M.Seed || w.life[w.idx(x, 25)] > 0) n++;
      }
      return n;
    };
    expect(sprouted(true)).toBeGreaterThan(sprouted(false));
  });

  it('a seed on ash grows into a tree without water (the ash bed); on dry earth it does not', () => {
    const grows = (ground: MaterialId): number => {
      const w = new World(30, 40, 3);
      fill(w, 0, 34, 30, 6, M.Earth);
      fill(w, 0, 33, 30, 1, ground);
      for (let x = 3; x < 30; x += 6) w.set(x, 32, M.Seed);
      run(w, 1500);
      return w.created[M.Wood];
    };
    expect(grows(M.Ash)).toBeGreaterThan(10);
    expect(grows(M.Earth)).toBe(0);
  });
});

describe('water plants keep their place', () => {
  it('a pond keeps its water and its fish: weeds and algae stay at the surface, in patches', { timeout: 30000 }, () => {
    // A pond dug into loam, its surface level with grassy banks.
    const w = new World(160, 90, 1);
    for (let y = 70; y < 90; y++) for (let x = 0; x < 160; x++) w.set(x, y, M.Loam);
    for (let y = 70; y < 86; y++) for (let x = 30; x < 130; x++) w.set(x, y, M.Water);
    for (let x = 0; x < 30; x++) w.set(x, 70, M.Grass);
    for (let x = 130; x < 160; x++) w.set(x, 70, M.Grass);
    for (let x = 35; x < 125; x += 10) {
      w.set(x, 70, M.Algae);
      w.set(x + 3, 78, M.Fish);
    }
    const water = w.count(M.Water);
    run(w, 7200);
    expect(w.count(M.Water)).toBeGreaterThan(water * 0.9);
    expect(w.count(M.Fish)).toBeGreaterThan(3);
    // Algae drifts in rafts: well short of covering the whole 100-cell surface.
    expect(w.count(M.Algae)).toBeLessThan(70);
  });

  it('kelp grows in slender stalks of mixed heights, not a solid bed', { timeout: 60000 }, () => {
    const w = new World(120, 100, 2);
    for (let y = 30; y < 100; y++) for (let x = 0; x < 120; x++) w.set(x, y, M.SaltWater);
    for (let y = 96; y < 100; y++) for (let x = 0; x < 120; x++) w.set(x, y, M.Sand);
    for (let x = 15; x < 120; x += 18) w.set(x, 95, M.Seaweed);
    run(w, 9000);
    // Six stalks with their fronds: a few hundred cells at most, not the thousands of a solid bed.
    expect(w.count(M.Seaweed)).toBeLessThan(400);
    let tallest = 0;
    for (let x = 0; x < 120; x++) for (let y = 30; y < 96; y++) if (w.get(x, y) === M.Seaweed) { tallest = Math.max(tallest, 95 - y); break; }
    expect(tallest).toBeGreaterThan(15);
  });
});

describe('light powders in the wind', () => {
  const leftInPlace = (m: MaterialId, wind: number, frames: number): number => {
    const w = new World(160, 60, 1);
    for (let x = 0; x < 160; x++) w.set(x, 59, M.Stone);
    for (let y = 47; y < 59; y++) for (let x = 20; x < 32; x++) w.set(x, y, m);
    w.wind = wind;
    run(w, frames);
    let home = 0;
    for (let y = 0; y < 60; y++) for (let x = 18; x < 34; x++) if (w.get(x, y) === m) home++;
    return home;
  };

  it('a strong wind only rolls the surface of a sand heap; most of it stays put', () => {
    expect(leftInPlace(M.Sand, 1, 600)).toBeGreaterThan(144 * 0.5);
    expect(leftInPlace(M.Sand, 0, 600)).toBeGreaterThan(144 * 0.6);
  });

  it('sawdust flies: a gust clears a whole pile in a couple of seconds and carries it far further than sand', () => {
    expect(leftInPlace(M.Sawdust, 1, 120)).toBeLessThan(144 * 0.1);
    const reach = (m: MaterialId): number => {
      const w = new World(300, 60, 1);
      for (let x = 0; x < 300; x++) w.set(x, 59, M.Stone);
      for (let y = 47; y < 59; y++) for (let x = 20; x < 32; x++) w.set(x, y, m);
      w.wind = 1;
      run(w, 120);
      let sx = 0;
      let n = 0;
      for (let i = 0; i < w.size; i++) if (w.mat[i] === m) { sx += i % 300; n++; }
      return sx / n;
    };
    // Measured: sawdust ends up about 265 cells downwind (at the far wall), sand about 55.
    expect(reach(M.Sawdust)).toBeGreaterThan(reach(M.Sand) + 100);
  });
});

describe('tree species', () => {
  // A seed on `ground`, with a sea or a pond walled off to its left if asked, grown for a while.
  const grow = (ground: MaterialId, water: MaterialId | null, life = 0, frames = 3000, height = 80): World => {
    const w = new World(70, height, 3);
    const top = height - 10;
    for (let y = top; y < height; y++) for (let x = 0; x < 70; x++) w.set(x, y, ground);
    if (water) {
      for (let y = top + 1; y < height; y++) for (let x = 0; x < 20; x++) w.set(x, y, water);
      for (let y = top; y < height; y++) w.set(20, y, M.Stone);
    }
    const sx = water ? 23 : 35;
    w.set(sx, top - 1, M.Seed);
    const i = w.idx(sx, top - 1);
    w.life[i] = life;
    if (life >= GIANT_TIP) w.vel[i] = life - GIANT_TIP;
    run(w, frames);
    return w;
  };
  const widthAt = (w: World, y: number): number => {
    let n = 0;
    for (let x = 0; x < w.width; x++) if (w.get(x, y) === M.Wood) n++;
    return n;
  };
  const tallest = (w: World, m: MaterialId): number => {
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) if (w.get(x, y) === m) return w.height - 10 - y;
    return 0;
  };

  it('a seed from a pine cone grows a pine: needles in tiers, no broad leaves, bare at the foot', () => {
    const w = grow(M.Earth, null, PINE_SEED);
    expect(w.count(M.Needles)).toBeGreaterThan(60);
    expect(w.count(M.Leaf)).toBe(0);
    // Bare trunk just above the ground: only the one column of wood, no needles beside it.
    expect(widthAt(w, 68)).toBe(1);
    expect(w.get(34, 68)).toBe(M.Empty);
  });

  it('pine cones open into pine seeds', () => {
    const w = new World(20, 20, 4);
    for (let x = 0; x < 20; x++) w.set(x, 19, M.Stone);
    w.set(10, 18, M.PineCone);
    run(w, 300);
    expect(w.get(10, 18)).toBe(M.Seed);
    expect(w.life[w.idx(10, 18)]).toBe(PINE_SEED);
  });

  it('a seed on a sandy shore by the sea grows a palm: a tall, thin trunk topped with fronds', () => {
    const w = grow(M.Sand, M.SaltWater);
    expect(tallest(w, M.Wood)).toBeGreaterThan(12);
    expect(widthAt(w, 62)).toBe(1);
    expect(w.count(M.Leaf)).toBeGreaterThan(15);
    expect(w.count(M.Needles)).toBe(0);
  });

  it('a seed beside fresh water grows a willow, its leaves hanging in curtains', () => {
    const w = grow(M.Earth, M.Water);
    expect(w.count(M.Leaf)).toBeGreaterThan(40);
    // Curtains: columns of leaves reaching down below the wood.
    let lowestLeaf = 0;
    for (let y = 0; y < 70; y++) for (let x = 25; x < 70; x++) if (w.get(x, y) === M.Leaf) lowestLeaf = Math.max(lowestLeaf, y);
    expect(lowestLeaf).toBeGreaterThan(55);
  });

  it('a tall broadleaf has a trunk two cells thick low down', () => {
    let thick = false;
    for (let seed = 1; seed < 6 && !thick; seed++) {
      const w = new World(70, 80, seed);
      for (let y = 70; y < 80; y++) for (let x = 0; x < 70; x++) w.set(x, y, M.Loam);
      w.set(35, 69, M.Seed);
      run(w, 3000);
      if (tallest(w, M.Wood) > 25 && widthAt(w, 66) >= 2) thick = true;
    }
    expect(thick).toBe(true);
  });

  it('a giant tree grows huge: a trunk three cells thick, far taller than the rest, with boughs', { timeout: 20000 }, () => {
    const w = grow(M.Loam, null, GIANT_TIP + 85, 6000, 130);
    expect(tallest(w, M.Wood)).toBeGreaterThan(70);
    expect(widthAt(w, 115)).toBe(3);
    expect(w.count(M.Leaf)).toBeGreaterThan(300);
  });
});

describe('fixed powders', () => {
  it('creatures and seeds are never pinned: they move by themselves', () => {
    const w = new World(40, 40, 4);
    w.drawFixed = true;
    w.paint(10, 10, 1, M.Earthworm);
    w.paint(30, 10, 1, M.Seed);
    w.paint(20, 30, 0, M.Sand);
    let pins = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Earthworm || w.mat[i] === M.Seed) pins += w.pinned[i];
    expect(pins).toBe(0);
    expect(w.pinned[w.idx(20, 30)]).toBe(1);
    run(w, 200);
    expect(w.get(10, 10)).toBe(M.Empty);
  });

  it('sand drawn fixed stays where it was put; ordinary sand falls', () => {
    const w = new World(40, 40, 1);
    w.drawFixed = true;
    w.paint(10, 10, 3, M.Sand);
    w.drawFixed = false;
    w.paint(30, 10, 3, M.Sand);
    const fixed = w.count(M.Sand);
    run(w, 200);
    let high = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (w.get(x, y) === M.Sand) high++;
    expect(high).toBeGreaterThan(20);
    expect(w.get(30, 10)).toBe(M.Empty);
    expect(w.count(M.Sand)).toBe(fixed);
  });

  it('drawn fixed, it goes down solid, not scattered', () => {
    const w = new World(40, 40, 2);
    w.drawFixed = true;
    w.paint(20, 20, 4, M.Sand);
    // A full disc of radius 4: every cell within it.
    let n = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 20) n++;
    expect(w.count(M.Sand)).toBe(n);
  });

  it('fixed gunpowder still burns, and a blast knocks fixed grains loose', () => {
    const w = new World(40, 40, 3);
    for (let x = 0; x < 40; x++) w.set(x, 39, M.Stone);
    w.drawFixed = true;
    w.paint(20, 10, 2, M.Gunpowder);
    w.paint(10, 20, 2, M.Sand);
    w.drawFixed = false;
    w.ignite(w.idx(20, 10));
    run(w, 300);
    expect(w.count(M.Gunpowder)).toBe(0);
    w.explode(10, 25, 5);
    run(w, 300);
    // Thrown loose, the sand has fallen to the floor.
    let floor = 0;
    for (let x = 0; x < 40; x++) if (w.get(x, 38) === M.Sand) floor++;
    expect(floor).toBeGreaterThan(0);
  });

  it('open edges leave fixed powders alone', () => {
    const w = new World(30, 30, 4);
    w.openEdges = true;
    w.drawFixed = true;
    for (let x = 0; x < 30; x++) w.paint(x, 29, 0, M.Sand);
    w.drawFixed = false;
    run(w, 100);
    expect(w.count(M.Sand)).toBe(30);
  });
});

describe('tree roots', () => {
  it('a sprouting tree sends roots down into the soil, deeper for a bigger tree', () => {
    const w = new World(40, 60, 1);
    for (let y = 40; y < 60; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Loam);
    w.set(20, 39, M.Seed);
    run(w, 600);
    expect(w.count(M.Root)).toBeGreaterThan(6);
    let deepest = 0;
    for (let y = 40; y < 60; y++) for (let x = 0; x < 40; x++) if (w.get(x, y) === M.Root) deepest = Math.max(deepest, y - 40);
    expect(deepest).toBeGreaterThan(4);
    // Nothing but soil was turned to root: no roots above ground.
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) expect(w.get(x, y)).not.toBe(M.Root);
  });

  it('roots stop at rock', () => {
    const w = new World(40, 60, 2);
    for (let y = 40; y < 43; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Loam);
    for (let y = 43; y < 60; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Stone);
    w.set(20, 39, M.Seed);
    run(w, 600);
    for (let y = 43; y < 60; y++) for (let x = 0; x < 40; x++) expect(w.get(x, y)).toBe(M.Stone);
  });
});

describe('glass and ice can be heard', () => {
  it('glass caught in a blast shatters (a sound event), and melting ice cracks', () => {
    const w = new World(30, 30, 1);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) w.set(x, y, M.Glass);
    w.explode(15, 15, 4);
    expect(w.noise.shatters).toBeGreaterThan(0);
    const ice = new World(20, 20, 2);
    for (let x = 0; x < 20; x++) ice.set(x, 19, M.ThinIce);
    run(ice, 300);
    expect(ice.noise.cracks).toBeGreaterThan(0);
    // Stone in a blast makes no such sound.
    const stone = new World(30, 30, 3);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) stone.set(x, y, M.Stone);
    stone.explode(15, 15, 4);
    expect(stone.noise.shatters).toBe(0);
  });
});

describe('ash soaks into the soil', () => {
  /** A layer of ash `depth` cells deep on a bed of `soil`. */
  const bed = (soil: MaterialId, depth: number, seed: number): World => {
    const w = new World(60, 30, seed);
    for (let y = 20; y < 30; y++) for (let x = 0; x < 60; x++) w.set(x, y, soil);
    for (let y = 20 - depth; y < 20; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Ash);
    return w;
  };

  it('an ash bed on earth lasts a while, then sinks in over a minute or two, enriching it into loam', { timeout: 30000 }, () => {
    const w = bed(M.Earth, 2, 1);
    run(w, 600);
    // Ten seconds on, most of the ash bed is still there for seeds to grow in.
    expect(w.count(M.Ash)).toBeGreaterThan(120 * 0.6);
    run(w, 6600);
    expect(w.count(M.Ash)).toBeLessThan(120 * 0.15);
    expect(w.count(M.Loam)).toBeGreaterThan(80);
  });

  it('earth or a worm lying on top of an ash heap leaves it be: the heap soaks in only from the bottom', { timeout: 30000 }, () => {
    const w = new World(60, 40, 5);
    for (let y = 30; y < 40; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Earth);
    for (let y = 20; y < 30; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Ash);
    for (let x = 0; x < 60; x++) w.set(x, 19, x % 4 ? M.Earth : M.Earthworm);
    run(w, 2400);
    // The top half of the heap is untouched (the worms only turn the earth layer they crawl in to loam).
    let loamHigh = 0;
    for (let y = 20; y < 25; y++) for (let x = 0; x < 60; x++) if (w.get(x, y) === M.Loam) loamHigh++;
    expect(loamHigh).toBe(0);
    let ashTop = 0;
    for (let y = 20; y < 25; y++) for (let x = 0; x < 60; x++) if (w.get(x, y) === M.Ash) ashTop++;
    expect(ashTop).toBeGreaterThan(300 * 0.95);
  });

  it('ash on bare rock stays heaped', () => {
    const w = bed(M.Stone, 2, 2);
    run(w, 3000);
    expect(w.count(M.Ash)).toBe(120);
  });

  it('earthworms work ash beside them into the soil much faster', () => {
    const count = (worms: boolean): number => {
      const w = bed(M.Earth, 1, 3);
      if (worms) for (let x = 2; x < 60; x += 4) w.set(x, 21, M.Earthworm);
      run(w, 1200);
      return w.count(M.Ash);
    };
    expect(count(true)).toBeLessThan(count(false) - 8);
  });
});

describe('ice frozen out of the sky', () => {
  it('steam freezing at the top falls as ice crystals that melt where they land, instead of hanging in the sky', { timeout: 30000 }, () => {
    const w = new World(40, 60, 1);
    for (let x = 0; x < 40; x++) w.set(x, 59, M.Stone);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 40; x++) w.set(x, y, M.Steam);
    let made = 0;
    for (let f = 0; f < 1500; f++) {
      w.step();
      made = w.created[M.Ice];
    }
    expect(made).toBeGreaterThan(0);
    // None hangs in the sky, and none is left as ice on the warm floor.
    expect(w.count(M.Ice) + w.count(M.Icicle)).toBe(0);
  });

  it('a crystal landing on frozen ground stays as ice; on warm ground it melts', () => {
    const drop = (floor: MaterialId): World => {
      const w = new World(20, 20, 4);
      for (let x = 0; x < 20; x++) w.set(x, 19, floor);
      w.set(10, 2, M.Ice);
      w.life[w.idx(10, 2)] = FALLING_ICE;
      run(w, 200);
      return w;
    };
    const cold = drop(M.Ice);
    expect(cold.get(10, 18)).toBe(M.Ice);
    expect(cold.count(M.Ice)).toBe(21);
    const warm = drop(M.Stone);
    expect(warm.count(M.Ice)).toBe(0);
    expect(warm.count(M.Water)).toBe(1);
  });

  it('a steady plume of steam grows no icicles at the top of the sky', { timeout: 60000 }, () => {
    const w = new World(60, 80, 2);
    for (let x = 0; x < 60; x++) w.set(x, 79, M.Stone);
    for (let f = 0; f < 4000; f++) {
      for (let x = 25; x < 35; x++) if (w.get(x, 70) === M.Empty) w.set(x, 70, M.Steam);
      w.step();
    }
    let high = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 60; x++) if (w.get(x, y) === M.Ice || w.get(x, y) === M.Icicle) high++;
    expect(high).toBe(0);
  });

  it('ice you draw in mid-air stays put', () => {
    const w = new World(20, 20, 3);
    w.paint(10, 5, 1, M.Ice);
    const n = w.count(M.Ice);
    run(w, 100);
    expect(w.get(10, 5)).toBe(M.Ice);
    expect(w.count(M.Ice)).toBe(n);
  });
});


describe('anomalies', () => {
  function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
    for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
  }

  it('a cold sun freezes the water and puts out the fire around it, and glows brighter as it drinks heat', () => {
    const w = new World(30, 30, 1);
    fill(w, 0, 25, 30, 5, M.Stone);
    fill(w, 5, 20, 20, 5, M.Water);
    w.set(15, 19, M.ColdSun);
    const sun = w.idx(15, 19);
    fill(w, 12, 16, 3, 2, M.Wood);
    w.ignite(w.idx(13, 16));
    run(w, 300);
    expect(w.count(M.ThinIce)).toBeGreaterThan(10);
    let burning = 0;
    for (let i = 0; i < w.size; i++) if (w.burn[i] > 0) burning++;
    expect(burning).toBe(0);
    expect(w.count(M.Wood)).toBeGreaterThan(0);
    expect(w.shade[sun]).toBeGreaterThan(0);
  });

  it('a lift field throws sand and water up out of it, to rain down outside', () => {
    const w = new World(40, 60, 2);
    fill(w, 0, 58, 40, 2, M.Stone);
    fill(w, 14, 50, 12, 8, M.Sand);
    w.set(20, 57, M.LiftField);
    let highest = 60;
    for (let f = 0; f < 200; f++) {
      w.step();
      for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Sand) highest = Math.min(highest, (i / 40) | 0);
    }
    expect(highest).toBeLessThan(40);
    // Ordinary sand nearby, out of reach, stays piled.
    const v = new World(40, 60, 2);
    fill(v, 0, 58, 40, 2, M.Stone);
    fill(v, 14, 50, 12, 8, M.Sand);
    let top = 60;
    for (let f = 0; f < 200; f++) {
      v.step();
      for (let i = 0; i < v.size; i++) if (v.mat[i] === M.Sand) top = Math.min(top, (i / 40) | 0);
    }
    expect(top).toBeGreaterThanOrEqual(50);
  });

  it('a gravity knot crushes coal held against it into diamond', () => {
    const w = new World(40, 40, 3);
    w.set(20, 15, M.GravityKnot);
    w.set(19, 15, M.Coal);
    w.set(21, 15, M.Coal);
    w.set(20, 14, M.Coal);
    run(w, 600);
    expect(w.created[M.Diamond]).toBeGreaterThan(0);
  });

  it('a gravity knot pulls sand in mid-air towards it, where it would otherwise fall', () => {
    const near = (knot: boolean): number => {
      const w = new World(40, 40, 3);
      if (knot) w.set(20, 15, M.GravityKnot);
      fill(w, 24, 12, 3, 3, M.Sand);
      run(w, 300);
      let n = 0;
      for (let y = 8; y < 23; y++) for (let x = 13; x < 28; x++) if (w.get(x, y) === M.Sand || w.get(x, y) === M.Stone) n++;
      return n;
    };
    expect(near(true)).toBeGreaterThan(5);
    expect(near(false)).toBe(0);
  });

  it('a stasis pocket slows a fire burning beside it', () => {
    const burnTime = (pocket: boolean): number => {
      const w = new World(30, 30, 4);
      fill(w, 0, 25, 30, 5, M.Stone);
      fill(w, 12, 20, 6, 5, M.Wood);
      if (pocket) w.set(15, 19, M.StasisPocket);
      w.ignite(w.idx(14, 20));
      let f = 0;
      for (; f < 6000 && w.count(M.Wood) > 0; f++) w.step();
      return f;
    };
    expect(burnTime(true)).toBeGreaterThan(burnTime(false) * 2);
  });

  it('an arc node throws arcs that light the wood and spark the copper around it', () => {
    const w = new World(30, 30, 5);
    fill(w, 0, 25, 30, 5, M.Stone);
    w.set(15, 15, M.ArcNode);
    fill(w, 9, 14, 2, 3, M.Wood);
    fill(w, 20, 14, 2, 3, M.Copper);
    let sparked = 0;
    let lit = 0;
    for (let f = 0; f < 1500; f++) {
      w.step();
      for (let i = 0; i < w.size; i++) {
        if (w.mat[i] === M.Copper && w.charge[i] !== 0) sparked++;
        if (w.mat[i] === M.Wood && w.burn[i] > 0) lit++;
      }
    }
    expect(w.created[M.Lightning]).toBeGreaterThan(5);
    expect(sparked).toBeGreaterThan(0);
    expect(lit).toBeGreaterThan(0);
  });

  it('a phase fault melts ice and boils water without heat, and they change back a little way off', () => {
    const w = new World(40, 40, 7);
    fill(w, 0, 36, 40, 4, M.Stone);
    fill(w, 14, 30, 12, 6, M.Ice);
    w.set(20, 29, M.PhaseFault);
    run(w, 400);
    expect(w.created[M.Water]).toBeGreaterThan(0);
    expect(w.created[M.Steam]).toBeGreaterThan(0);
    // Nothing near it was hot to begin with: it took no fire to do it.
    expect(w.created[M.Fire]).toBe(0);
  });

  it('linked gates: sand poured into one comes out of another', () => {
    const w = new World(60, 40, 8);
    fill(w, 0, 38, 60, 2, M.Stone);
    w.set(10, 20, M.LinkedGate);
    w.set(50, 10, M.LinkedGate);
    for (let f = 0; f < 300; f++) {
      if (w.get(10, 10) === M.Empty) w.set(10, 10, M.Sand);
      w.step();
    }
    // Sand turns up on the far side, under the other gate.
    let far = 0;
    for (let y = 0; y < 40; y++) for (let x = 40; x < 60; x++) if (w.get(x, y) === M.Sand) far++;
    expect(far).toBeGreaterThan(20);
  });

  it('a lone gate goes nowhere', () => {
    const w = new World(40, 40, 9);
    fill(w, 0, 38, 40, 2, M.Stone);
    w.set(20, 20, M.LinkedGate);
    w.set(20, 15, M.Sand);
    run(w, 100);
    // It lands on the gate and slides off beside it, as off any pillar: it isn't sent anywhere.
    expect(w.count(M.Sand)).toBe(1);
    let x = -1;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Sand) x = i % 40;
    expect(Math.abs(x - 20)).toBeLessThanOrEqual(2);
  });

  it('a transmuter turns iron to copper to gold and coal towards diamond, then burns out into slag', () => {
    const w = new World(20, 20, 10);
    fill(w, 0, 15, 20, 5, M.Stone);
    w.set(10, 10, M.Transmuter);
    w.set(9, 10, M.Iron);
    w.set(11, 10, M.Graphite);
    w.set(10, 9, M.Stone);
    w.set(10, 11, M.Iron);
    run(w, 4000);
    expect(w.created[M.Copper]).toBeGreaterThan(0);
    expect(w.created[M.Gold] + w.created[M.Diamond]).toBeGreaterThan(0);
    expect(w.count(M.Transmuter)).toBe(0);
    expect(w.created[M.Slag]).toBeGreaterThan(0);
  });

  it('anomalies shrug off blasts', () => {
    const w = new World(30, 30, 6);
    for (const [k, m] of [M.ColdSun, M.LiftField, M.GravityKnot, M.StasisPocket, M.ArcNode].entries()) w.set(10 + k * 2, 15, m);
    w.explode(14, 15, 8);
    expect(w.count(M.ColdSun) + w.count(M.LiftField) + w.count(M.GravityKnot) + w.count(M.StasisPocket) + w.count(M.ArcNode)).toBe(5);
  });
});
