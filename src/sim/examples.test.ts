import { describe, expect, it } from 'vitest';
import { EXAMPLES, M, MATERIALS, World, type Example } from './index';

function load(id: string, width = 373, height = 214): World {
  const w = new World(width, height, 1);
  (EXAMPLES.find((e) => e.id === id) as Example).build(w);
  return w;
}

function run(w: World, frames: number): void {
  for (let f = 0; f < frames; f++) w.step();
}

describe('example scenes', () => {
  it('every example builds at phone, laptop and wide sizes, and none counts as discovered', () => {
    for (const example of EXAMPLES) {
      for (const [width, height] of [[130, 190], [373, 214], [420, 110]]) {
        const w = new World(width, height, 2);
        example.build(w);
        let filled = 0;
        for (let i = 0; i < w.size; i++) if (w.mat[i] !== M.Empty) filled++;
        expect(filled, `${example.name} at ${width}×${height}`).toBeGreaterThan(w.size * 0.05);
        expect(w.created.every((n) => n === 0)).toBe(true);
      }
      expect(example.hint.length).toBeGreaterThan(20);
    }
  });

  it('fuse and charges: the battery lights the fuse and all three charges go off', { timeout: 30000 }, () => {
    const w = load('charges');
    expect(w.count(M.Dynamite)).toBeGreaterThan(0);
    run(w, 600);
    // The dynamite itself, not just the fuse's own little pops (which once passed for it).
    expect(w.count(M.Dynamite)).toBe(0);
  });

  it('volcano island: lava meets the sea, boiling it and crusting', { timeout: 30000 }, () => {
    const w = load('volcano');
    run(w, 1500);
    expect(w.created[M.Steam] + w.created[M.Basalt] + w.created[M.Stone]).toBeGreaterThan(0);
  });

  it('thunderstorm: the storm strikes', { timeout: 30000 }, () => {
    const w = load('storm');
    for (let f = 0; f < 4000 && w.noise.strikes === 0; f++) w.step();
    expect(w.noise.strikes).toBeGreaterThan(0);
  });

  it('forest: set alight, it drops pine cones', { timeout: 30000 }, () => {
    const w = load('forest');
    for (let i = 0; i < w.size; i++) if (w.mat[i] === M.Leaf && w.rng.chance(0.05)) w.ignite(i);
    run(w, 900);
    expect(w.created[M.PineCone]).toBeGreaterThan(0);
  });

  it('primordial wilderness: every part is there at every size, and it differs each time', () => {
    for (const [width, height] of [[130, 190], [373, 214], [420, 110]]) {
      const w = load('wilderness', width, height);
      for (const m of [M.SaltWater, M.Sand, M.Seaweed, M.Grass, M.Loam, M.Peat, M.Wood, M.Lava, M.VolcanicVent, M.Coal, M.Oil, M.Stalactite, M.Cloud, M.Basalt]) {
        expect(w.count(m), `${MATERIALS[m].name} at ${width}×${height}`).toBeGreaterThan(0);
      }
      expect(w.count(M.IronOre) + w.count(M.CopperOre)).toBeGreaterThan(0);
    }
    const a = new World(373, 214, 1);
    const b = new World(373, 214, 2);
    (EXAMPLES.find((e) => e.id === 'wilderness') as Example).build(a);
    (EXAMPLES.find((e) => e.id === 'wilderness') as Example).build(b);
    let differ = 0;
    for (let i = 0; i < a.size; i++) if (a.mat[i] !== b.mat[i]) differ++;
    expect(differ).toBeGreaterThan(a.size * 0.05);
  });

  it('primordial wilderness: it runs, and the volcano smoulders', { timeout: 30000 }, () => {
    const w = load('wilderness');
    run(w, 900);
    expect(w.count(M.Lava)).toBeGreaterThan(0);
    expect(w.created[M.Steam] + w.created[M.Smoke] + w.created[M.Basalt] + w.created[M.StormCloud]).toBeGreaterThan(0);
  });

  it('primordial wilderness: lightning striking the sea crosses it and dies out, and the sea stays', { timeout: 60000 }, () => {
    // Once, a pulse could circle round the grains and weed in a struck sea for ever, and its heat
    // boiled the whole sea away into salt within a few seconds.
    const w = new World(373, 214, 5);
    (EXAMPLES.find((e) => e.id === 'wilderness') as Example).build(w);
    const sea = w.count(M.SaltWater);
    let strikes = 0;
    for (let f = 0; f < 1200; f++) {
      w.step();
      strikes += w.noise.strikes;
      w.noise.strikes = 0;
    }
    expect(strikes).toBeGreaterThan(3);
    expect(w.count(M.SaltWater)).toBeGreaterThan(sea * 0.9);
    expect(w.count(M.Salt)).toBeLessThan(30);
  });

  it('pond life: the fish and worms are there to draw birds', () => {
    const w = load('pond');
    expect(w.count(M.Fish)).toBeGreaterThan(3);
    expect(w.count(M.Earthworm)).toBeGreaterThan(3);
  });
});
