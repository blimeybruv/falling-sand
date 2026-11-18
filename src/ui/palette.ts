/**
 * The material palette. Built from the material table, so new materials appear automatically.
 * In Discovery mode, materials not yet discovered show as locked "?" slots that give a hint.
 */
import { M, PALETTE, type Discovery, type MaterialId } from '../sim';
import { swatchColour } from '../render/renderer';
import type { GameState } from './state';

export const ERASER_KEY = 'e';
const ERASER_SWATCH = 'repeating-conic-gradient(#444 0 25%, #222 0 50%) 0 0 / 8px 8px';

export class Palette {
  private readonly buttons = new Map<MaterialId, HTMLButtonElement>();

  constructor(
    private readonly el: HTMLElement,
    private readonly state: GameState,
    private readonly discovery: Discovery,
    private readonly toast: (message: string) => void,
  ) {
    for (const def of PALETTE) this.add(def.id);
    this.add(M.Empty);
    this.refresh();
  }

  isAvailable(id: MaterialId): boolean {
    return id === M.Empty || this.state.mode === 'sandbox' || this.discovery.isUnlocked(id);
  }

  /** Select a material. If it's locked, show its hint instead and return false. */
  select(id: MaterialId): boolean {
    if (!this.isAvailable(id)) {
      this.toast(`Not discovered yet. Hint: ${this.discovery.describe(id)}`);
      return false;
    }
    this.state.tool = id;
    for (const [tid, b] of this.buttons) b.setAttribute('aria-pressed', String(tid === id));
    this.buttons.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  /** Redraw locked/unlocked states (after a discovery or a mode change). */
  refresh(): void {
    for (const [id, b] of this.buttons) {
      const available = this.isAvailable(id);
      const def = PALETTE.find((d) => d.id === id);
      const name = id === M.Empty ? 'Eraser' : (def?.name ?? '');
      const key = id === M.Empty ? ERASER_KEY : (def?.key ?? '');
      const swatch = b.querySelector('.swatch') as HTMLElement;
      b.classList.toggle('locked', !available);
      (b.querySelector('.name') as HTMLElement).textContent = available ? name : '???';
      swatch.style.background = available ? (id === M.Empty ? ERASER_SWATCH : swatchColour(id)) : '';
      swatch.textContent = available ? '' : '?';
      (b.querySelector('kbd') as HTMLElement).textContent = available ? key.toUpperCase() : '';
      b.title = available
        ? `${id === M.Empty ? 'Clears cells.' : (def?.description ?? '')}${key ? ` (${key.toUpperCase()})` : ''}`
        : `Not discovered yet. Hint: ${this.discovery.describe(id)}`;
    }
    if (!this.isAvailable(this.state.tool)) this.select(M.Sand);
    else this.select(this.state.tool);
  }

  /** Briefly highlight a newly discovered material. */
  flash(id: MaterialId): void {
    const b = this.buttons.get(id);
    if (!b) return;
    b.classList.remove('new');
    void b.offsetWidth; // restart the animation
    b.classList.add('new');
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private add(id: MaterialId): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.innerHTML = `<span class="swatch"></span><span class="name"></span><kbd></kbd>`;
    b.addEventListener('click', () => this.select(id));
    this.el.append(b);
    this.buttons.set(id, b);
  }
}
