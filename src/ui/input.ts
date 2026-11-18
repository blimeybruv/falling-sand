/**
 * Pointer input on the canvas: mouse, pen and touch through Pointer Events.
 * - Left button, pen or one finger draws the selected material; right button erases.
 * - Two fingers on the canvas erase (both strokes switch to the eraser).
 * Strokes are applied once per animation frame (see `apply`), so holding still keeps pouring.
 * Also tracks where the pointer is, so the renderer can show the brush outline.
 */
import { M, type World } from '../sim';
import type { GameState } from './state';

interface Stroke {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  erase: boolean;
  touch: boolean;
}

export class PointerInput {
  private readonly strokes = new Map<number, Stroke>();
  private hover: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly state: GameState,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', (e) => {
      if (!this.strokes.has(e.pointerId)) this.hover = null;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Paint every active stroke from its last position to its current one. Call once per frame. */
  apply(): void {
    for (const s of this.strokes.values()) {
      const tool = s.erase ? M.Empty : this.state.tool;
      this.world.paintLine(s.lastX, s.lastY, s.x, s.y, this.state.brush, tool);
      s.lastX = s.x;
      s.lastY = s.y;
    }
  }

  /** Grid cell under the pointer (or the finger, while touching), or null. */
  cursor(): { x: number; y: number } | null {
    return this.hover;
  }

  private toGrid(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.world.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.world.height);
    return [x, y];
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (e.g. a synthetic event); drawing still works without capture.
    }
    const [x, y] = this.toGrid(e);
    const touch = e.pointerType === 'touch';
    this.strokes.set(e.pointerId, { x, y, lastX: x, lastY: y, erase: e.button === 2, touch });
    this.hover = { x, y };
    // A second finger turns every touch stroke into an eraser.
    const touches = [...this.strokes.values()].filter((s) => s.touch);
    if (touches.length >= 2) for (const s of touches) s.erase = true;
  };

  private readonly onMove = (e: PointerEvent): void => {
    const [x, y] = this.toGrid(e);
    const s = this.strokes.get(e.pointerId);
    if (!s) {
      if (e.pointerType !== 'touch') this.hover = { x, y };
      return;
    }
    // Fast strokes: paint the intermediate points the browser coalesced into this event.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 1 ? events.slice(0, -1) : []) {
      [s.x, s.y] = this.toGrid(ce);
      this.apply();
    }
    s.x = x;
    s.y = y;
    this.hover = { x, y };
  };

  private readonly onUp = (e: PointerEvent): void => {
    const s = this.strokes.get(e.pointerId);
    if (!s) return;
    this.apply();
    this.strokes.delete(e.pointerId);
    if (s.touch) this.hover = null;
  };
}
