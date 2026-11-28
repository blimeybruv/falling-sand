/**
 * Pointer input on the canvas: mouse, pen and touch through Pointer Events.
 * - Left button, pen or one finger draws the selected material with the current drawing tool;
 *   right button erases with it.
 * - Brush and replace strokes are applied once per animation frame (see `apply`), so holding still
 *   keeps pouring. Line, box and circle are dragged out with a preview and drawn when let go.
 * - Zoom and pan (see View): the mouse wheel zooms at the pointer, the middle button drags the view,
 *   and two fingers pinch to zoom and drag to pan (a stroke the first finger began is dropped).
 * Before each change it asks for an undo snapshot (`onChange`).
 * Also tracks where the pointer is, so the renderer can show the brush outline or the preview.
 */
import { M, rasterShape, type MaterialId, type Shape, type World } from '../sim';
import type { GameState } from './state';
import type { View } from './view';

interface Stroke {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  /** Where a shape was started. */
  startX: number;
  startY: number;
  erase: boolean;
  touch: boolean;
  /** The shape being dragged out, or null for a brush or replace stroke. */
  shape: Shape | null;
  /** Replace stroke: the material it swaps out (picked up where the stroke began; Empty: anything). */
  replace: MaterialId | null;
}

export class PointerInput {
  private readonly strokes = new Map<number, Stroke>();
  /** Pointers moving the view (middle button, or two fingers), by id, at their last position. */
  private readonly panning = new Map<number, { x: number; y: number }>();
  /** Touch pointers currently down (to spot a second finger). */
  private readonly touches = new Set<number>();
  private hover: { x: number; y: number } | null = null;
  private readonly mark: Uint8Array;
  private readonly cells: Int32Array;
  private previewCount = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly state: GameState,
    private readonly onChange: () => void,
    private readonly view: View,
  ) {
    this.mark = new Uint8Array(world.size);
    this.cells = new Int32Array(world.size);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // Smooth on trackpads (many small deltas), a notch at a time on wheels.
        const lines = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        view.zoomBy(Math.exp(-lines * 0.0015), e.clientX, e.clientY);
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', (e) => {
      if (!this.strokes.has(e.pointerId)) this.hover = null;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Paint every active brush or replace stroke from its last position to its current one, and update a shape's preview. Call once per frame. */
  apply(): void {
    this.previewCount = 0;
    for (const s of this.strokes.values()) {
      const tool = s.erase ? M.Empty : this.state.tool;
      if (s.shape) {
        this.previewCount = this.rasterise(s);
      } else if (s.replace !== null) {
        this.world.replaceLine(s.lastX, s.lastY, s.x, s.y, this.state.brush, s.replace, tool);
      } else {
        this.world.paintLine(s.lastX, s.lastY, s.x, s.y, this.state.brush, tool);
      }
      s.lastX = s.x;
      s.lastY = s.y;
    }
  }

  /** The keyboard brush's cell while it's on; otherwise the grid cell under the pointer (or the finger, while touching), or null. */
  cursor(): { x: number; y: number } | null {
    return this.state.keyCursor ?? this.hover;
  }

  /** While a shape is being dragged: the cells it will cover, to draw as a preview. */
  preview(): { cells: Int32Array; count: number } | null {
    return this.previewCount > 0 ? { cells: this.cells, count: this.previewCount } : null;
  }

  private rasterise(s: Stroke): number {
    const { world, state } = this;
    return rasterShape(s.shape!, s.startX, s.startY, s.x, s.y, state.brush, state.fill, world.width, world.height, this.mark, this.cells);
  }

  private toGrid(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.world.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.world.height);
    return [x, y];
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (e.g. a synthetic event); drawing still works without capture.
    }
    const touch = e.pointerType === 'touch';
    if (touch) this.touches.add(e.pointerId);
    // Middle button: drag the view.
    if (e.button === 1) {
      this.panning.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    // A second finger: both fingers now pinch and pan the view; the first finger's stroke stops.
    if (touch && this.touches.size >= 2) {
      for (const [id, s] of this.strokes) {
        if (!s.touch) continue;
        if (s.shape) this.previewCount = 0;
        this.strokes.delete(id);
      }
      this.panning.clear();
      for (const id of this.touches) this.panning.set(id, id === e.pointerId ? { x: e.clientX, y: e.clientY } : (this.lastTouch.get(id) ?? { x: e.clientX, y: e.clientY }));
      this.hover = null;
      return;
    }
    if (this.panning.size > 0) return;
    const [x, y] = this.toGrid(e);
    // One snapshot per change: when the first pointer goes down.
    if (this.strokes.size === 0) this.onChange();
    const tool = this.state.drawTool;
    const shape: Shape | null = tool === 'line' || tool === 'box' || tool === 'circle' ? tool : null;
    let replace: MaterialId | null = null;
    if (tool === 'replace') {
      replace = this.world.inBounds(x, y) ? (this.world.mat[this.world.idx(x, y)] as MaterialId) : M.Empty;
    }
    this.strokes.set(e.pointerId, { x, y, lastX: x, lastY: y, startX: x, startY: y, erase: e.button === 2, touch, shape, replace });
    this.hover = { x, y };
  };

  /** Where each touch pointer last was (client pixels), so a pinch can start from the first finger's position. */
  private readonly lastTouch = new Map<number, { x: number; y: number }>();

  /** Move the view with the panning pointers: one drags it; two pinch (zoom about their midpoint) and drag. */
  private movePan(e: PointerEvent): void {
    const prev = this.panning.get(e.pointerId);
    if (!prev) return;
    const others = [...this.panning.entries()].filter(([id]) => id !== e.pointerId);
    if (others.length === 0) {
      this.view.panBy(e.clientX - prev.x, e.clientY - prev.y);
    } else {
      const o = others[0][1];
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      // The midpoint moves half as far as this finger did.
      this.view.panBy((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
      if (before > 10) this.view.zoomBy(after / before, (e.clientX + o.x) / 2, (e.clientY + o.y) / 2);
    }
    this.panning.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.lastTouch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.panning.has(e.pointerId)) {
      this.movePan(e);
      return;
    }
    const [x, y] = this.toGrid(e);
    const s = this.strokes.get(e.pointerId);
    if (!s) {
      if (e.pointerType !== 'touch') this.hover = { x, y };
      return;
    }
    // Fast strokes: paint the intermediate points the browser coalesced into this event.
    if (!s.shape) {
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ce of events.length > 1 ? events.slice(0, -1) : []) {
        [s.x, s.y] = this.toGrid(ce);
        this.apply();
      }
    }
    s.x = x;
    s.y = y;
    this.hover = { x, y };
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.releaseTouch(e);
    const s = this.strokes.get(e.pointerId);
    if (!s) return;
    if (s.shape) {
      // Let go: draw the shape.
      const count = this.rasterise(s);
      this.world.paintCells(this.cells, count, s.erase ? M.Empty : this.state.tool);
      this.previewCount = 0;
    } else {
      this.apply();
    }
    this.strokes.delete(e.pointerId);
    if (s.touch) this.hover = null;
  };

  /** A cancelled pointer (the browser took over the gesture) doesn't draw its half-dragged shape. */
  private readonly onCancel = (e: PointerEvent): void => {
    this.releaseTouch(e);
    const s = this.strokes.get(e.pointerId);
    if (!s) return;
    if (!s.shape) this.apply();
    this.previewCount = 0;
    this.strokes.delete(e.pointerId);
    if (s.touch) this.hover = null;
  };

  /** A pointer lifted: it stops panning (when one finger of a pinch lifts, the other can go on dragging the view). */
  private releaseTouch(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    this.lastTouch.delete(e.pointerId);
    this.panning.delete(e.pointerId);
    if (this.touches.size === 0 && e.pointerType === 'touch') this.panning.clear();
  }
}
