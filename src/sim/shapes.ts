/**
 * Shapes for the drawing tools: the grid cells a straight line, a box or a circle covers. The UI
 * uses the same cells to preview a shape while it's being dragged and to draw it when it's let go,
 * so what you see is exactly what you get. Pure logic: no World, no DOM.
 */

export type Shape = 'line' | 'box' | 'circle';

/**
 * Write into `out` the index (y * width + x) of every cell the shape covers, each once, and return
 * how many there are.
 * - line: from (x0, y0) to (x1, y1), `radius` cells thick each side (0: one cell wide).
 * - box: the rectangle with corners (x0, y0) and (x1, y1), outlined `radius` thick, or filled.
 * - circle: centred on (x0, y0), passing through (x1, y1), outlined `radius` thick, or filled.
 * `mark` must be all zeros, size width * height; it's left all zeros again. `out` needs room for
 * width * height entries.
 */
export function rasterShape(
  shape: Shape,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  filled: boolean,
  width: number,
  height: number,
  mark: Uint8Array,
  out: Int32Array,
): number {
  let n = 0;
  const r = Math.max(0, Math.floor(radius));
  const add = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (mark[i]) return;
    mark[i] = 1;
    out[n++] = i;
  };
  // A disc like the brush's, so lines are as thick as brush strokes of the same size.
  const disc = (cx: number, cy: number): void => {
    const r2 = r * r + r;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r2) add(cx + dx, cy + dy);
  };
  const line = (ax: number, ay: number, bx: number, by: number): void => {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let s = 0; s <= steps; s++) disc(Math.round(ax + ((bx - ax) * s) / steps), Math.round(ay + ((by - ay) * s) / steps));
  };

  if (shape === 'line') {
    line(x0, y0, x1, y1);
  } else if (shape === 'box') {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    if (filled) {
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) add(x, y);
    } else {
      line(left, top, right, top);
      line(right, top, right, bottom);
      line(right, bottom, left, bottom);
      line(left, bottom, left, top);
    }
  } else {
    const big = Math.round(Math.hypot(x1 - x0, y1 - y0));
    const outer = big + (filled ? 0.5 : r + 0.5);
    const inner = filled ? -1 : Math.max(0, big - r - 0.5);
    const reach = Math.ceil(outer);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= outer && d >= inner) add(x0 + dx, y0 + dy);
      }
    }
  }

  for (let k = 0; k < n; k++) mark[out[k]] = 0;
  return n;
}
