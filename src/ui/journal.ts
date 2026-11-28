/**
 * The journal: the goals, met or still to aim for, then every material, how it was made, or a hint
 * if it's still locked (in Sandbox mode everything is known).
 */
import { GOALS, PALETTE, type Discovery, type Goals } from '../sim';
import { swatchColour } from '../render/renderer';

export class Journal {
  constructor(
    private readonly dialog: HTMLElement,
    private readonly list: HTMLElement,
    private readonly progress: HTMLElement,
    private readonly discovery: Discovery,
    private readonly goals: Goals,
    private readonly goalList: HTMLElement,
    private readonly goalProgress: HTMLElement,
    /** Whether every material is known (Sandbox mode). */
    private readonly allKnown: () => boolean,
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

  /** "3 / 14" */
  goalSummary(): string {
    return `${this.goals.met.size} / ${this.goals.total}`;
  }

  refresh(): void {
    this.goalProgress.textContent = `${this.goalSummary()} goals met`;
    this.goalList.replaceChildren();
    for (const g of GOALS) {
      const met = this.goals.met.has(g.id);
      const li = document.createElement('li');
      li.className = met ? 'known' : 'unknown';
      const mark = document.createElement('span');
      mark.className = 'swatch goal-mark';
      mark.textContent = met ? '✓' : '';
      const name = document.createElement('strong');
      name.textContent = g.name;
      const text = document.createElement('span');
      text.textContent = g.hint;
      li.append(mark, name, text);
      this.goalList.append(li);
    }
    this.progress.textContent = this.allKnown() ? 'Every material, in Sandbox mode' : `${this.summary()} materials discovered`;
    this.list.replaceChildren();
    for (const def of PALETTE) {
      const known = this.allKnown() || this.discovery.isUnlocked(def.id);
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
