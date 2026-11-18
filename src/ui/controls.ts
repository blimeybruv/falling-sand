/**
 * Toolbar, material palette, scene menu, help panel and keyboard shortcuts.
 * Builds the palette from the material table, so new materials appear automatically.
 */
import { M, PALETTE, type MaterialId, type World } from '../sim';
import { swatchColour } from '../render/renderer';
import { downloadScene, loadFromBrowser, loadFromFile, saveToBrowser, shareLink } from './scenes';
import { MAX_BRUSH, MIN_BRUSH, SPEEDS, WINDS, type GameState } from './state';

const ERASER_KEY = 'e';

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

export function setupControls(state: GameState, world: World): void {
  const toolbar = byId<HTMLElement>('toolbar');
  const palette = byId<HTMLElement>('palette');
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

  // --- palette
  const buttons = new Map<MaterialId, HTMLButtonElement>();
  const addTool = (id: MaterialId, name: string, key: string, colour: string, title: string): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.title = key ? `${title} (${key.toUpperCase()})` : title;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="swatch"></span><span class="name"></span><kbd></kbd>`;
    (b.querySelector('.swatch') as HTMLElement).style.background = colour;
    (b.querySelector('.name') as HTMLElement).textContent = name;
    (b.querySelector('kbd') as HTMLElement).textContent = key.toUpperCase();
    b.addEventListener('click', () => selectTool(id));
    palette.append(b);
    buttons.set(id, b);
  };
  for (const def of PALETTE) addTool(def.id, def.name, def.key, swatchColour(def.id), def.description);
  addTool(M.Empty, 'Eraser', ERASER_KEY, 'repeating-conic-gradient(#444 0 25%, #222 0 50%) 0 0 / 8px 8px', 'Clears cells.');

  function selectTool(id: MaterialId): void {
    state.tool = id;
    for (const [tid, b] of buttons) b.setAttribute('aria-pressed', String(tid === id));
    buttons.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  selectTool(state.tool);

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
  const keyToTool = new Map<string, MaterialId>(PALETTE.map((d) => [d.key, d.id]));
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
    } else if (key === '?' || key === 'h') {
      setHelp(!helpOpen());
    } else if (key === 'escape') {
      setHelp(false);
      setMenu(false);
    } else {
      return;
    }
    e.preventDefault();
  });
}
