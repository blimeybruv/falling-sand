import { describe, expect, it } from 'vitest';
import { AMBIENT_TEMP, CHARGE_ACTIVE, M, MATERIALS, MAX_BLAST_RADIUS, MAX_EXPLOSIONS_PER_FRAME, PALETTE, World, type MaterialId } from './index';

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
      expect(def.conductivity, where).toBeLessThanOrEqual(0.25); // higher makes diffusion unstable
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

  it('burns clouds off from the top', () => {
    const run = (sun: number): number => {
      const w = new World(80, 100, 4);
      fill(w, 0, 22, 80, 6, M.Cloud);
      w.sun = sun;
      for (let f = 0; f < 300; f++) w.step();
      return count(w, M.Cloud);
    };
    expect(run(1)).toBeLessThan(run(0) * 0.75);
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
    expect(sunny.created[M.Cloud]).toBeGreaterThan(20);
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
    for (let y = 22; y < 42; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Cloud);
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
  // Grass on loam, the right half under a stone roof; returns grass grown in the open and in the shade.
  const grow = (sun: number): [number, number] => {
    const w = new World(80, 40, 14);
    for (let x = 0; x < 80; x++) {
      w.set(x, 39, M.Loam);
      w.set(x, 38, M.Loam);
    }
    for (let x = 40; x < 80; x++) w.set(x, 20, M.Stone);
    w.set(10, 37, M.Grass);
    w.set(60, 37, M.Grass);
    w.sun = sun;
    for (let f = 0; f < 1500; f++) w.step();
    let open = 0;
    let shade = 0;
    for (let i = 0; i < w.size; i++) {
      if (w.mat[i] !== M.Grass) continue;
      if (i % 80 < 40) open++;
      else shade++;
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

describe('rain', () => {
  it('is the cloud itself coming down, never water from nowhere', () => {
    const w = new World(60, 60, 7);
    for (let y = 20; y < 30; y++) for (let x = 0; x < 60; x++) w.set(x, y, M.Cloud);
    for (let f = 0; f < 3000; f++) w.step();
    let water = 0;
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Water) water++;
    expect(water).toBeGreaterThan(100);
    expect(water).toBeLessThanOrEqual(600);
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

