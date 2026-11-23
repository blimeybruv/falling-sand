import { describe, expect, it } from 'vitest';
import { EXAMPLES, M, World, type Example } from './index';

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

  it('fuse and charges: the battery lights the fuse and the charges go off', { timeout: 30000 }, () => {
    const w = load('charges');
    run(w, 1500);
    expect(w.noise.blasts).toBeGreaterThan(0);
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

  it('pond life: the fish and worms are there to draw birds', () => {
    const w = load('pond');
    expect(w.count(M.Fish)).toBeGreaterThan(3);
    expect(w.count(M.Earthworm)).toBeGreaterThan(3);
  });
});
