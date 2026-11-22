import { describe, expect, it } from 'vitest';
import { M, World, rasterShape, type Shape } from './index';

const W = 40;
const H = 30;
const mark = new Uint8Array(W * H);
const out = new Int32Array(W * H);

function cells(shape: Shape, x0: number, y0: number, x1: number, y1: number, radius: number, filled: boolean): Set<number> {
  const n = rasterShape(shape, x0, y0, x1, y1, radius, filled, W, H, mark, out);
  const set = new Set<number>();
  for (let k = 0; k < n; k++) set.add(out[k]);
  expect(set.size).toBe(n); // each cell once
  expect(mark.every((v) => v === 0)).toBe(true); // the scratch marks are left clean
  return set;
}

describe('shape tools', () => {
  it('a thin line runs from end to end, one cell wide', () => {
    const line = cells('line', 2, 3, 20, 3, 0, false);
    expect(line.size).toBe(19);
    expect(line.has(3 * W + 2)).toBe(true);
    expect(line.has(3 * W + 20)).toBe(true);
    const diagonal = cells('line', 0, 0, 10, 10, 0, false);
    expect(diagonal.size).toBe(11);
  });

  it('a thicker line is as wide as a brush stroke of the same size', () => {
    const thick = cells('line', 5, 10, 30, 10, 2, false);
    for (let y = 8; y <= 12; y++) expect(thick.has(y * W + 15)).toBe(true);
    expect(thick.has(7 * W + 15)).toBe(false);
  });

  it('a box is outlined or filled, whichever corner it is dragged from', () => {
    expect(cells('box', 5, 5, 14, 9, 0, false).size).toBe(2 * 10 + 2 * 5 - 4);
    expect(cells('box', 14, 9, 5, 5, 0, true).size).toBe(10 * 5);
  });

  it('a circle is centred where the drag starts and passes through where it ends', () => {
    const ring = cells('circle', 20, 15, 28, 15, 0, false);
    expect(ring.has(15 * W + 28)).toBe(true);
    expect(ring.has(15 * W + 12)).toBe(true);
    expect(ring.has(7 * W + 20)).toBe(true);
    expect(ring.has(15 * W + 20)).toBe(false); // hollow
    const disc = cells('circle', 20, 15, 28, 15, 0, true);
    expect(disc.size).toBeGreaterThan(Math.PI * 8 * 8 * 0.9);
    expect(disc.size).toBeLessThan(Math.PI * 9 * 9);
    expect(disc.has(15 * W + 20)).toBe(true);
  });

  it('stays inside the grid', () => {
    const big = cells('circle', 0, 0, 100, 0, 0, true);
    expect(big.size).toBe(W * H);
  });

  it('draws shapes solid, by the brush rules: only into empty space, and the eraser clears', () => {
    const w = new World(W, H, 1);
    w.set(10, 5, M.Stone);
    const n = rasterShape('box', 5, 5, 14, 9, 0, true, W, H, mark, out);
    w.paintCells(out, n, M.Sand);
    expect(w.count(M.Sand)).toBe(49);
    expect(w.get(10, 5)).toBe(M.Stone);
    w.paintCells(out, n, M.Empty);
    expect(w.count(M.Sand) + w.count(M.Stone)).toBe(0);
  });

  it('the replace brush swaps only the material it started on, and leaves empty space alone', () => {
    const w = new World(W, H, 2);
    for (let x = 0; x < 20; x++) {
      w.set(x, 10, M.Water);
      w.set(x, 11, M.Stone);
    }
    w.replaceLine(0, 10, 19, 10, 2, M.Water, M.Oil);
    expect(w.count(M.Oil)).toBe(20);
    expect(w.count(M.Water)).toBe(0);
    expect(w.count(M.Stone)).toBe(20);
    expect(w.count(M.Sand)).toBe(0);
    // Started on empty space: it swaps anything that isn't empty.
    w.replace(5, 11, 1, M.Empty, M.Glass);
    expect(w.count(M.Glass)).toBeGreaterThan(0);
  });
});
