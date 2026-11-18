/** The Discovery journal: every material, how it was made, or a hint if it's still locked. */
import { PALETTE, type Discovery } from '../sim';
import { swatchColour } from '../render/renderer';

export class Journal {
  constructor(
    private readonly dialog: HTMLElement,
    private readonly list: HTMLElement,
    private readonly progress: HTMLElement,
    private readonly discovery: Discovery,
  ) {}

  get open(): boolean {
    return !this.dialog.hidden;
  }

  setOpen(open: boolean): void {
    if (open) this.refresh();
    this.dialog.hidden = !open;
  }

  /** "7 / 20" */
  summary(): string {
    return `${this.discovery.unlocked.size} / ${this.discovery.total}`;
  }

  refresh(): void {
    this.progress.textContent = `${this.summary()} materials discovered`;
    this.list.replaceChildren();
    for (const def of PALETTE) {
      const known = this.discovery.isUnlocked(def.id);
      const li = document.createElement('li');
      li.className = known ? 'known' : 'unknown';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      if (known) swatch.style.background = swatchColour(def.id);
      else swatch.textContent = '?';
      const name = document.createElement('strong');
      name.textContent = known ? def.name : '???';
      const text = document.createElement('span');
      text.textContent = this.discovery.describe(def.id);
      li.append(swatch, name, text);
      this.list.append(li);
    }
  }
}
