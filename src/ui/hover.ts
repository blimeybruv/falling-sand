/**
 * A small label by the mouse pointer naming the material under it, like a tooltip: it appears once
 * the pointer has rested for a moment, and in heat view it gives the temperature too. Mouse and pen
 * only (a finger is always drawing), never while a button is held, and never over empty space.
 * It follows the grid as it changes: water boiling away under a still pointer relabels itself.
 */
import { M, MATERIALS, type World } from '../sim';

/** How long the pointer rests before the label appears, in ms. */
const REST_MS = 350;
/** Offset of the label from the pointer, in CSS pixels. */
const OFFSET_X = 14;
const OFFSET_Y = 18;

export class HoverLabel {
  private x = 0;
  private y = 0;
  private movedAt = 0;
  private over = false;
  private held = false;
  private text = '';

  constructor(
    private readonly stage: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly el: HTMLElement,
    private readonly world: World,
  ) {
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      // Barely moving (a hand resting on the mouse) doesn't count.
      if (this.over && Math.abs(e.clientX - this.x) + Math.abs(e.clientY - this.y) < 3 && e.buttons === 0) return;
      this.x = e.clientX;
      this.y = e.clientY;
      this.over = true;
      this.held = e.buttons !== 0;
      this.movedAt = performance.now();
      this.hide();
    });
    canvas.addEventListener('pointerdown', () => {
      this.held = true;
      this.hide();
    });
    canvas.addEventListener('pointerup', (e) => {
      this.held = false;
      this.x = e.clientX;
      this.y = e.clientY;
      this.movedAt = performance.now();
    });
    canvas.addEventListener('pointerleave', () => {
      this.over = false;
      this.hide();
    });
    canvas.addEventListener('wheel', () => {
      this.movedAt = performance.now();
      this.hide();
    });
  }

  /** Call once a frame. */
  update(now: number, heatView: boolean): void {
    if (!this.over || this.held || now - this.movedAt < REST_MS) return;
    const { world, canvas } = this;
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor(((this.x - rect.left) / rect.width) * world.width);
    const gy = Math.floor(((this.y - rect.top) / rect.height) * world.height);
    const m = world.inBounds(gx, gy) ? world.mat[world.idx(gx, gy)] : M.Empty;
    let text = '';
    if (m !== M.Empty) {
      text = MATERIALS[m].name;
      if (heatView) text += ` · ${Math.round(world.temp[world.idx(gx, gy)])}°`;
    }
    if (text === this.text) return;
    this.text = text;
    if (!text) {
      this.el.hidden = true;
      return;
    }
    const { el } = this;
    el.textContent = text;
    el.hidden = false;
    // Beside the pointer, flipped to its other side near the right or bottom edge of the stage.
    const box = this.stage.getBoundingClientRect();
    let left = this.x - box.left + OFFSET_X;
    let top = this.y - box.top + OFFSET_Y;
    if (left + el.offsetWidth > box.width - 4) left = this.x - box.left - OFFSET_X - el.offsetWidth;
    if (top + el.offsetHeight > box.height - 4) top = this.y - box.top - OFFSET_Y - el.offsetHeight;
    el.style.left = `${Math.max(4, left)}px`;
    el.style.top = `${Math.max(4, top)}px`;
  }

  private hide(): void {
    if (this.text === '') return;
    this.text = '';
    this.el.hidden = true;
  }
}
