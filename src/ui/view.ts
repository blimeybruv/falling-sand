/**
 * Zoom and pan: which part of the grid the canvas shows, and how big. Only the view changes (a CSS
 * transform on the canvas), never the grid, so the simulation costs the same at any zoom. Pointer
 * input reads positions through getBoundingClientRect, which follows the transform, so drawing
 * still lands on the cell under the pointer.
 */

/** How far in you can zoom: this many times the fitted size. */
export const MAX_ZOOM = 8;
/** One mouse-wheel notch or zoom key: this much in or out. */
const ZOOM_STEP = 1.25;

export class View {
  /** 1 is the whole grid fitted to the stage. */
  zoom = 1;
  /** The grid point (in cells) at the middle of the stage. */
  private cx: number;
  private cy: number;
  private readonly listeners: (() => void)[] = [];

  constructor(
    private readonly stage: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly cols: number,
    private readonly rows: number,
  ) {
    this.cx = cols / 2;
    this.cy = rows / 2;
    canvas.style.transformOrigin = '0 0';
  }

  /** Call something whenever the zoom changes (to update the zoom readout). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** CSS pixels per cell at the fitted size. */
  private get scale(): number {
    return this.canvas.clientWidth / this.cols || 1;
  }

  /** Zoom by `factor`, keeping the grid point under (clientX, clientY) where it is (default: the middle). */
  zoomBy(factor: number, clientX?: number, clientY?: number): void {
    const z = Math.max(1, Math.min(MAX_ZOOM, this.zoom * factor));
    if (z === this.zoom) return;
    const rect = this.stage.getBoundingClientRect();
    const sx = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const sy = (clientY ?? rect.top + rect.height / 2) - rect.top;
    // The grid point under the pointer before, which must stay under it after.
    const [gx, gy] = this.toGrid(sx, sy);
    const s = this.scale;
    this.zoom = z;
    this.cx = gx - (sx - rect.width / 2) / (s * z);
    this.cy = gy - (sy - rect.height / 2) / (s * z);
    this.apply();
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP);
  }

  reset(): void {
    this.zoom = 1;
    this.cx = this.cols / 2;
    this.cy = this.rows / 2;
    this.apply();
  }

  /** Move the view by (dx, dy) CSS pixels, as if dragging the picture. */
  panBy(dx: number, dy: number): void {
    const k = this.scale * this.zoom;
    this.cx -= dx / k;
    this.cy -= dy / k;
    this.apply();
  }

  /** Stage position (CSS pixels from its top-left) to grid point, at the current view. */
  private toGrid(sx: number, sy: number): [number, number] {
    const rect = this.stage.getBoundingClientRect();
    const k = this.scale * this.zoom;
    return [this.cx + (sx - rect.width / 2) / k, this.cy + (sy - rect.height / 2) / k];
  }

  /** Keep the view on the grid, and set the canvas's transform to match. Call after the stage resizes too. */
  apply(): void {
    const { stage, canvas } = this;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const s = this.scale;
    const k = s * this.zoom;
    // The view can't wander off the grid: clamp the middle so the edges stay in (or centred, if
    // the grid is smaller than the stage along that side).
    const clamp = (c: number, cells: number, px: number): number => {
      const half = px / 2 / k;
      return half >= cells / 2 ? cells / 2 : Math.max(half, Math.min(cells - half, c));
    };
    this.cx = clamp(this.cx, this.cols, w);
    this.cy = clamp(this.cy, this.rows, h);
    if (this.zoom === 1) {
      canvas.style.transform = '';
    } else {
      const tx = w / 2 - canvas.offsetLeft - this.cx * k;
      const ty = h / 2 - canvas.offsetTop - this.cy * k;
      canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${this.zoom})`;
    }
    for (const fn of this.listeners) fn();
  }
}
