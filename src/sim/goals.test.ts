import { describe, expect, it } from 'vitest';
import { GOALS, Goals, M, World, type MaterialId } from './index';

function fill(w: World, x0: number, y0: number, wd: number, ht: number, m: MaterialId): void {
  for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) w.set(x, y, m);
}

/** A world in which goal `id` has been met. */
function meeting(id: string): World {
  const w = new World(60, 40, 1);
  switch (id) {
    case 'forest':
      fill(w, 0, 35, 60, 5, M.Earth);
      for (let x = 5; x < 60; x += 10) fill(w, x, 25, 1, 10, M.Wood);
      break;
    case 'boil':
      w.created[M.Steam] = 1500;
      break;
    case 'glass':
      w.created[M.Glass] = 100;
      break;
    case 'storm':
      w.totals.strikes = 3;
      break;
    case 'blast':
      w.totals.blasts = 20;
      break;
    case 'land':
      w.created[M.Basalt] = 150;
      break;
    case 'food':
      for (let x = 0; x < 8; x++) w.set(x * 2, 30, M.Fish);
      w.set(30, 5, M.Seagull);
      break;
    case 'night':
      w.set(10, 5, M.Owl);
      w.set(20, 5, M.Bat);
      break;
    case 'glacier':
      w.created[M.Ice] = 30;
      fill(w, 0, 30, 60, 1, M.Snow);
      break;
    case 'salt':
      w.created[M.Salt] = 50;
      break;
    case 'glow':
      for (let x = 0; x < 6; x++) w.set(x * 3, 10, M.GlowWorm);
      break;
    case 'anomaly':
      w.created[M.ColdSun] = 1;
      break;
    case 'eldritch':
      w.created[M.Hush] = 1;
      break;
    case 'worldtree':
      w.set(30, 1, M.Worldwood);
      break;
    default:
      throw new Error(`no test world for goal ${id}`);
  }
  return w;
}

describe('goals', () => {
  it('no goal is met in an empty world, and each is met when it should be', () => {
    const empty = new World(60, 40, 1);
    for (const g of GOALS) {
      expect(g.done(empty), g.id).toBe(false);
      expect(g.done(meeting(g.id)), g.id).toBe(true);
    }
  });

  it('painting the answer with the brush does not count for what has to be made', () => {
    const w = new World(60, 40, 1);
    w.paint(30, 20, 6, M.Basalt);
    w.paint(10, 10, 4, M.Glass);
    for (const id of ['land', 'glass']) expect(GOALS.find((g) => g.id === id)!.done(w)).toBe(false);
  });

  it('a forest needs five separate trees standing in soil, not one thick trunk', () => {
    const w = new World(60, 40, 1);
    fill(w, 0, 35, 60, 5, M.Earth);
    fill(w, 20, 25, 6, 10, M.Wood);
    expect(GOALS.find((g) => g.id === 'forest')!.done(w)).toBe(false);
  });

  it('remembers what has been met, reports each goal once, and ignores unknown saved ids', () => {
    const goals = new Goals(['blast', 'nonsense']);
    expect(goals.met.has('blast')).toBe(true);
    expect(goals.met.has('nonsense')).toBe(false);
    const w = new World(60, 40, 1);
    w.totals.blasts = 50;
    w.totals.strikes = 5;
    expect(goals.check(w).map((g) => g.id)).toEqual(['storm']);
    expect(goals.check(w)).toEqual([]);
    expect(goals.toJSON().sort()).toEqual(['blast', 'storm']);
    goals.reset();
    expect(goals.met.size).toBe(0);
  });

  it('the world counts its explosions and lightning strikes', () => {
    const w = new World(40, 40, 2);
    w.explode(20, 20, 3);
    w.explode(10, 10, 3);
    expect(w.totals.blasts).toBe(2);
  });
});
