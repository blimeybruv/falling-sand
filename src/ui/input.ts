/**
 * Pointer input on the canvas: mouse, pen and touch through Pointer Events.
 * Left button / finger draws the selected material; right button erases.
 * Strokes are applied once per animation frame (see `apply`), so holding still keeps pouring.
 */
import { M, type World } from '../sim';
import type { GameState } from './state';

interface Stroke {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  erase: boolean;
}

export class PointerInput {
  private readonly strokes = new Map<number, Stroke>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly state: GameState,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
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

  private toGrid(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.world.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.world.height);
    return [x, y];
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const [x, y] = this.toGrid(e);
    this.strokes.set(e.pointerId, { x, y, lastX: x, lastY: y, erase: e.button === 2 });
  };

  private readonly onMove = (e: PointerEvent): void => {
    const s = this.strokes.get(e.pointerId);
    if (!s) return;
    // Fast strokes: paint the intermediate points the browser coalesced into this event.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 1 ? events.slice(0, -1) : []) {
      const [cx, cy] = this.toGrid(ce);
      s.x = cx;
      s.y = cy;
      this.apply();
    }
    [s.x, s.y] = this.toGrid(e);
  };

  private readonly onUp = (e: PointerEvent): void => {
    const s = this.strokes.get(e.pointerId);
    if (s) {
      this.apply();
      this.strokes.delete(e.pointerId);
    }
  };
}
