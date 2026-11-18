/**
 * Toolbar, scene menu, Discovery mode (journal, mode switch, unlock messages), help panel and
 * keyboard shortcuts. The palette itself is in palette.ts.
 */
import { M, PALETTE, type Discovery, type MaterialId, type World } from '../sim';
import { Journal } from './journal';
import { ERASER_KEY, Palette } from './palette';
import { saveDiscovery, saveMode, type Mode } from './progress';
import { downloadScene, loadFromBrowser, loadFromFile, saveToBrowser, shareLink } from './scenes';
import { MAX_BRUSH, MIN_BRUSH, SPEEDS, WINDS, type GameState } from './state';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

let toastTimer = 0;
/** Show a short message at the bottom of the canvas. */
export function toast(message: string): void {
  const el = byId<HTMLElement>('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 2600);
}

export interface Controls {
  /** Call after World.step() in Discovery mode: unlocks and announces anything newly made. */
  checkDiscoveries(): void;
}

export function setupControls(state: GameState, world: World, discovery: Discovery): Controls {
  const toolbar = byId<HTMLElement>('toolbar');
  const playBtn = byId<HTMLButtonElement>('play');
  const stepBtn = byId<HTMLButtonElement>('step');
  const clearBtn = byId<HTMLButtonElement>('clear');
  const speedSel = byId<HTMLSelectElement>('speed');
  const windSel = byId<HTMLSelectElement>('wind');
  const heatBtn = byId<HTMLButtonElement>('heat');
  const brush = byId<HTMLInputElement>('brush');
  const brushValue = byId<HTMLElement>('brush-value');
  const moreBtn = byId<HTMLButtonElement>('more');
  const sceneBtn = byId<HTMLButtonElement>('scene-button');
  const sceneMenu = byId<HTMLElement>('scene-menu');
  const sceneFile = byId<HTMLInputElement>('scene-file');
  const helpBtn = byId<HTMLButtonElement>('help-button');
  const help = byId<HTMLElement>('help');
  const helpClose = byId<HTMLButtonElement>('help-close');

  const palette = new Palette(byId<HTMLElement>('palette'), state, discovery, toast);
  const selectTool = (id: MaterialId): void => void palette.select(id);

  // --- discovery
  const modeSel = byId<HTMLSelectElement>('mode');
  const journalBtn = byId<HTMLButtonElement>('journal-button');
  const journal = new Journal(byId('journal'), byId('journal-list'), byId('journal-progress'), discovery);
  const syncDiscovery = (): void => {
    journalBtn.hidden = state.mode !== 'discovery';
    journalBtn.innerHTML = `<span class="label">Journal </span>${journal.summary()}`;
    modeSel.value = state.mode;
    palette.refresh();
    if (journal.open) journal.refresh();
  };
  const setMode = (mode: Mode): void => {
    state.mode = mode;
    saveMode(mode);
    // Only what happens from now on counts towards discoveries, not earlier sandbox play.
    if (mode === 'discovery') world.created.fill(0);
    syncDiscovery();
  };
  modeSel.addEventListener('change', () => setMode(modeSel.value === 'sandbox' ? 'sandbox' : 'discovery'));
  journalBtn.addEventListener('click', () => journal.setOpen(!journal.open));
  byId<HTMLButtonElement>('journal-close').addEventListener('click', () => journal.setOpen(false));
  byId<HTMLElement>('journal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) journal.setOpen(false);
  });
  byId<HTMLButtonElement>('journal-reset').addEventListener('click', () => {
    if (!confirm('Forget all your discoveries and start again?')) return;
    discovery.reset();
    saveDiscovery(discovery);
    world.created.fill(0);
    syncDiscovery();
  });
  syncDiscovery();

  const checkDiscoveries = (): void => {
    if (state.mode !== 'discovery') return;
    const fresh = discovery.update(world.created);
    if (fresh.length === 0) return;
    saveDiscovery(discovery);
    syncDiscovery();
    for (const id of fresh) palette.flash(id);
    const names = fresh.map((id) => PALETTE.find((d) => d.id === id)?.name ?? '?');
    const reward = fresh.includes(discovery.rewardMaterial) ? ' Reward unlocked!' : '';
    toast(`Discovered ${names.join(', ')}! (${journal.summary()})${reward}`);
  };

  // --- toolbar
  const syncPlay = (): void => {
    playBtn.textContent = state.paused ? '▶ Play' : '❚❚ Pause';
    playBtn.setAttribute('aria-pressed', String(state.paused));
    stepBtn.disabled = !state.paused;
  };
  const togglePause = (): void => {
    state.paused = !state.paused;
    syncPlay();
  };
  const step = (): void => {
    if (state.paused) state.pendingSteps++;
  };
  const setBrush = (r: number): void => {
    state.brush = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, r));
    brush.value = String(state.brush);
    brushValue.textContent = String(state.brush);
  };
  const toggleHeat = (): void => {
    state.heatView = !state.heatView;
    heatBtn.setAttribute('aria-pressed', String(state.heatView));
  };

  playBtn.addEventListener('click', togglePause);
  stepBtn.addEventListener('click', step);
  clearBtn.addEventListener('click', () => world.clear());
  heatBtn.addEventListener('click', toggleHeat);
  moreBtn.addEventListener('click', () => {
    const open = toolbar.classList.toggle('expanded');
    moreBtn.setAttribute('aria-expanded', String(open));
  });

  for (const s of SPEEDS) {
    const opt = document.createElement('option');
    opt.value = String(s);
    opt.textContent = `${s}×`;
    opt.selected = s === state.speed;
    speedSel.append(opt);
  }
  speedSel.addEventListener('change', () => (state.speed = Number(speedSel.value)));

  for (const [label, value] of WINDS) {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = label;
    opt.selected = value === world.wind;
    windSel.append(opt);
  }
  windSel.addEventListener('change', () => (world.wind = Number(windSel.value)));

  brush.min = String(MIN_BRUSH);
  brush.max = String(MAX_BRUSH);
  brush.addEventListener('input', () => setBrush(Number(brush.value)));
  setBrush(state.brush);
  syncPlay();

  // Don't leave buttons focused, or Space would "click" them as well as toggling pause.
  document.addEventListener('click', (e) => {
    const b = e.target instanceof HTMLElement ? e.target.closest('button') : null;
    if (b) b.blur();
  });

  // --- scene menu
  const setMenu = (open: boolean): void => {
    sceneMenu.hidden = !open;
    sceneBtn.setAttribute('aria-expanded', String(open));
  };
  sceneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(sceneMenu.hidden !== false);
  });
  document.addEventListener('click', (e) => {
    if (!sceneMenu.hidden && !(e.target instanceof Node && sceneMenu.contains(e.target))) setMenu(false);
  });
  const run = async (action: () => Promise<string | void>): Promise<void> => {
    setMenu(false);
    try {
      const message = await action();
      if (message) toast(message);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong');
    }
  };
  const actions: Record<string, () => Promise<string | void>> = {
    save: async () => {
      await saveToBrowser(world);
      return 'Scene saved in this browser';
    },
    load: async () => ((await loadFromBrowser(world)) ? 'Scene loaded' : 'No saved scene yet'),
    download: async () => downloadScene(world),
    open: async () => sceneFile.click(),
    share: async () => {
      const url = await shareLink(world);
      try {
        await navigator.clipboard.writeText(url);
        return 'Link copied';
      } catch {
        return 'Link is in the address bar';
      }
    },
  };
  for (const item of sceneMenu.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
    const action = actions[item.dataset.action ?? ''];
    if (action) item.addEventListener('click', () => void run(action));
  }
  sceneFile.addEventListener('change', () => {
    const file = sceneFile.files?.[0];
    sceneFile.value = '';
    if (file) void run(async () => {
      await loadFromFile(world, file);
      return 'Scene loaded';
    });
  });

  // --- help
  const helpOpen = (): boolean => !help.hidden;
  const setHelp = (open: boolean): void => {
    help.hidden = !open;
    helpBtn.setAttribute('aria-expanded', String(open));
  };
  helpBtn.addEventListener('click', () => setHelp(!helpOpen()));
  helpClose.addEventListener('click', () => setHelp(false));
  help.addEventListener('click', (e) => {
    if (e.target === help) setHelp(false);
  });

  // --- keyboard
  const keyToTool = new Map<string, MaterialId>(PALETTE.filter((d) => d.key).map((d) => [d.key, d.id]));
  keyToTool.set(ERASER_KEY, M.Empty);

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) {
      if (e.key !== ' ' && e.key !== 'Escape') return;
    }
    const key = e.key.toLowerCase();
    const tool = keyToTool.get(key);
    if (tool !== undefined) {
      selectTool(tool);
    } else if (key === ' ') {
      togglePause();
    } else if (key === '.') {
      step();
    } else if (key === '[') {
      setBrush(state.brush - 1);
    } else if (key === ']') {
      setBrush(state.brush + 1);
    } else if (key === 't') {
      toggleHeat();
    } else if (key === 'j' && state.mode === 'discovery') {
      journal.setOpen(!journal.open);
    } else if (key === '?' || key === 'h') {
      setHelp(!helpOpen());
    } else if (key === 'escape') {
      setHelp(false);
      setMenu(false);
      journal.setOpen(false);
    } else {
      return;
    }
    e.preventDefault();
  });

  return { checkDiscoveries };
}
