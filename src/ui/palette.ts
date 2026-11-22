/**
 * The material palette. Built from the material table, so new materials appear automatically.
 * Tabs filter it by category (the eraser is always shown). In Discovery mode, materials not yet
 * discovered show as locked "?" slots that give a hint.
 */
import { CATEGORIES, M, MATERIALS, PALETTE, type Category, type Discovery, type MaterialId } from '../sim';
import { swatchColour } from '../render/renderer';
import type { GameState } from './state';

export const ERASER_KEY = 'e';
const ERASER_SWATCH = 'repeating-conic-gradient(#444 0 25%, #222 0 50%) 0 0 / 8px 8px';

export class Palette {
  private readonly buttons = new Map<MaterialId, HTMLButtonElement>();
  private readonly tabs = new Map<Category | 'all', HTMLButtonElement>();
  private readonly tools: HTMLElement;

  constructor(
    el: HTMLElement,
    private readonly state: GameState,
    private readonly discovery: Discovery,
    private readonly toast: (message: string) => void,
  ) {
    const tabRow = document.createElement('div');
    tabRow.className = 'palette-tabs';
    tabRow.setAttribute('role', 'tablist');
    this.tools = document.createElement('div');
    this.tools.className = 'palette-tools';
    // The tab row shares its line with the drawing tools (brush, line, box...), filled in by the controls.
    const head = document.createElement('div');
    head.className = 'palette-head';
    const drawTools = document.createElement('div');
    drawTools.id = 'draw-tools';
    drawTools.className = 'draw-tools';
    drawTools.setAttribute('role', 'toolbar');
    drawTools.setAttribute('aria-label', 'Drawing tools');
    head.append(tabRow, drawTools);
    el.append(head, this.tools);
    for (const [id, label] of [['all', 'All'], ...CATEGORIES] as const) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'tab';
      t.setAttribute('role', 'tab');
      t.textContent = label;
      t.addEventListener('click', () => this.showTab(id));
      tabRow.append(t);
      this.tabs.set(id, t);
    }
    for (const def of PALETTE) this.add(def.id);
    this.add(M.Empty);
    this.showTab('all');
    this.refresh();
  }

  /** Show one category (or all). The eraser is always visible. */
  showTab(tab: Category | 'all'): void {
    for (const [id, t] of this.tabs) t.setAttribute('aria-selected', String(id === tab));
    for (const [id, b] of this.buttons) {
      b.hidden = !(tab === 'all' || id === M.Empty || MATERIALS[id].category === tab);
    }
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
    // Picked by keyboard from another tab: show its tab.
    if (this.buttons.get(id)?.hidden) this.showTab(MATERIALS[id].category);
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
    this.tools.append(b);
    this.buttons.set(id, b);
  }
}
