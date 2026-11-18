import { describe, expect, it } from 'vitest';
import { M, World, applyScene, captureScene, decodeScene, encodeScene } from './index';

function sample(): World {
  const w = new World(50, 30, 1);
  for (let x = 0; x < 50; x++) w.set(x, 29, M.Stone);
  for (let x = 10; x < 40; x++) for (let y = 20; y < 29; y++) w.set(x, y, x % 3 ? M.Water : M.Sand);
  w.set(25, 5, M.Lava);
  return w;
}

describe('scenes', () => {
  it('round-trips through encode and decode', () => {
    const w = sample();
    const bytes = encodeScene(captureScene(w));
    const scene = decodeScene(bytes);
    expect(scene.width).toBe(50);
    expect(scene.height).toBe(30);
    expect(Array.from(scene.mat)).toEqual(Array.from(w.mat));
  });

  it('is compact for mostly-empty scenes', () => {
    const bytes = encodeScene(captureScene(sample()));
    expect(bytes.length).toBeLessThan(400); // 1500 cells
    const empty = encodeScene(captureScene(new World(400, 200)));
    expect(empty.length).toBeLessThan(12);
  });

  it('loads into a world of the same size exactly', () => {
    const w = sample();
    const copy = new World(50, 30, 2);
    applyScene(copy, decodeScene(encodeScene(captureScene(w))));
    expect(Array.from(copy.mat)).toEqual(Array.from(w.mat));
  });

  it('centres and floors a scene in a bigger world, and crops in a smaller one', () => {
    const scene = captureScene(sample());
    const big = new World(70, 40, 3);
    applyScene(big, scene);
    expect(big.get(10, 39)).toBe(M.Stone); // floor row lands on the bottom, offset by (70 - 50) / 2
    expect(big.get(9, 39)).toBe(M.Empty);
    expect(big.count(M.Lava)).toBe(1);
    const small = new World(20, 10, 4);
    applyScene(small, scene);
    expect(small.count(M.Stone)).toBe(20);
    expect(small.count(M.Lava)).toBe(0); // cropped off the top
  });

  it('rejects data that is not a scene', () => {
    expect(() => decodeScene(new Uint8Array([1, 2, 3]))).toThrow(/Not a falling-sand scene/);
    const bytes = encodeScene(captureScene(sample()));
    expect(() => decodeScene(bytes.slice(0, bytes.length - 3))).toThrow(/truncated|corrupt/);
    const bad = bytes.slice();
    bad[2] = 99;
    expect(() => decodeScene(bad)).toThrow(/version/);
  });

  it('loads unknown materials (from a newer version) as empty', () => {
    const bytes = Uint8Array.from([0x46, 0x53, 1, 2, 0, 1, 0, 200, 1, M.Sand, 1]);
    const scene = decodeScene(bytes);
    expect(Array.from(scene.mat)).toEqual([M.Empty, M.Sand]);
  });
});
