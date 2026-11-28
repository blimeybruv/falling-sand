/**
 * Goals: small challenges to aim for once the materials are found ("grow a forest", "boil a pond
 * dry"), shown in the journal in both modes. Each is checked against the world now and then by the
 * UI; what counts is what the simulation has made (World.created) or what stands in the grid now,
 * so drawing the answer with the brush doesn't count.
 */
import { M, type MaterialId } from './ids';
import { MATERIALS } from './materials';
import type { World } from './world';

export interface Goal {
  id: string;
  name: string;
  /** What to do, said as a nudge. */
  hint: string;
  done(w: World): boolean;
}

/** Ground a tree can stand on. */
function soil(t: number): boolean {
  return t === M.Earth || t === M.Loam || t === M.Grass || t === M.Sand || t === M.Ash || t === M.Fertiliser || t === M.Mud || t === M.Clay;
}

/** Trees standing now: trunks rooted in soil, at least 3 cells apart. */
function trees(w: World): number {
  let n = 0;
  let last = -10;
  for (let x = 0; x < w.width; x++) {
    for (let y = w.height - 2; y >= 0; y--) {
      if (w.mat[y * w.width + x] === M.Wood && soil(w.mat[(y + 1) * w.width + x])) {
        if (x - last >= 3) n++;
        last = x;
        break;
      }
    }
  }
  return n;
}

function createdOfCategory(w: World, category: string): number {
  let n = 0;
  for (const d of MATERIALS) if (d.category === category) n += w.created[d.id];
  return n;
}

function made(w: World, m: MaterialId): number {
  return w.created[m];
}

export const GOALS: readonly Goal[] = [
  { id: 'forest', name: 'A forest', hint: 'Grow five trees, standing at once.', done: (w) => trees(w) >= 5 },
  { id: 'boil', name: 'Boil a pond dry', hint: 'Turn a whole pond to steam (1,500 cells of it).', done: (w) => made(w, M.Steam) >= 1500 },
  { id: 'glass', name: 'Glassmaker', hint: 'Make a hundred cells of glass from sand.', done: (w) => made(w, M.Glass) >= 100 },
  { id: 'storm', name: 'Thunderstruck', hint: 'Have a storm strike three times.', done: (w) => w.totals.strikes >= 3 },
  { id: 'blast', name: 'Chain reaction', hint: 'Set off twenty explosions.', done: (w) => w.totals.blasts >= 20 },
  { id: 'land', name: 'Fresh land', hint: 'Let lava crust into 150 cells of basalt.', done: (w) => made(w, M.Basalt) >= 150 },
  { id: 'food', name: 'Food chain', hint: 'Keep eight fish and a seagull alive at once.', done: (w) => w.count(M.Fish) >= 8 && w.count(M.Seagull) >= 1 },
  { id: 'night', name: 'Night life', hint: 'Have an owl and a bat out at once.', done: (w) => w.count(M.Owl) >= 1 && w.count(M.Bat) >= 1 },
  { id: 'glacier', name: 'Glacier', hint: 'Pile snow deep enough that it packs into ice beneath.', done: (w) => made(w, M.Ice) >= 30 && w.count(M.Snow) >= 60 },
  { id: 'salt', name: 'Salt of the earth', hint: 'Win fifty grains of salt back from salt water.', done: (w) => made(w, M.Salt) >= 50 },
  { id: 'glow', name: 'Lights in the dark', hint: 'Keep six glow worms alive in a cave.', done: (w) => w.count(M.GlowWorm) >= 6 },
  { id: 'anomaly', name: 'Anomaly hunter', hint: 'Make an anomaly happen.', done: (w) => createdOfCategory(w, 'anomaly') > 0 },
  { id: 'eldritch', name: 'Something wrong', hint: 'Make something eldritch happen.', done: (w) => createdOfCategory(w, 'eldritch') > 0 },
  {
    id: 'worldtree',
    name: 'To the top',
    hint: 'Grow a worldtree all the way to the top of the map.',
    done: (w) => {
      for (let i = 0; i < w.width * 4; i++) if (w.mat[i] === M.Worldwood || w.mat[i] === M.WorldTip) return true;
      return false;
    },
  },
];

/** Which goals have been met: checked against a world now and then, remembered between visits. */
export class Goals {
  readonly met = new Set<string>();

  /** `saved`: goal ids from a previous visit (see toJSON). Unknown ids are dropped. */
  constructor(saved: readonly string[] = []) {
    for (const id of saved) if (GOALS.some((g) => g.id === id)) this.met.add(id);
  }

  get total(): number {
    return GOALS.length;
  }

  /** Check the world; returns the goals newly met. */
  check(w: World): Goal[] {
    const fresh: Goal[] = [];
    for (const g of GOALS) {
      if (this.met.has(g.id) || !g.done(w)) continue;
      this.met.add(g.id);
      fresh.push(g);
    }
    return fresh;
  }

  reset(): void {
    this.met.clear();
  }

  toJSON(): string[] {
    return [...this.met];
  }
}
