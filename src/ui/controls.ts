/**
 * Toolbar, scene menu, Discovery mode (journal, mode switch, unlock messages), help panel and
 * keyboard shortcuts. The palette itself is in palette.ts.
 */
import { EXAMPLES, M, PALETTE, type Discovery, type MaterialId, type World } from '../sim';
import { Journal } from './journal';
import { ERASER_KEY, Palette } from './palette';
import { saveDiscovery, saveMode, type Mode } from './progress';
import { downloadScene, loadFromBrowser, loadFromFile, saveToBrowser, shareLink } from './scenes';
import { heatColour } from '../render/renderer';
import { DAY_LENGTH, MAX_BRUSH, MIN_BRUSH, SPEEDS, SUNS, WINDS, type GameState } from './state';
import type { Sound } from './sound';
import type { History } from './history';
import type { View } from './view';
import type { DrawTool } from './state';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

let toastTimer = 0;
/** Show a short message at the bottom of the canvas (for `ms` milliseconds). */
export function toast(message: string, ms = 2600): void {
  const el = byId<HTMLElement>('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

export interface Controls {
  /** Call after World.step() in Discovery mode: unlocks and announces anything newly made. */
  checkDiscoveries(): void;
}

export function setupControls(state: GameState, world: World, discovery: Discovery, sound: Sound, history: History, view: View): Controls {
  const toolbar = byId<HTMLElement>('toolbar');
  const playBtn = byId<HTMLButtonElement>('play');
  const stepBtn = byId<HTMLButtonElement>('step');
  const clearBtn = byId<HTMLButtonElement>('clear');
  const speedSel = byId<HTMLSelectElement>('speed');
  const windSel = byId<HTMLSelectElement>('wind');
  const sunSel = byId<HTMLSelectElement>('sun');
  const soundBtn = byId<HTMLButtonElement>('sound');
  const heatBtn = byId<HTMLButtonElement>('heat');
  const edgesBtn = byId<HTMLButtonElement>('edges');
  const brush = byId<HTMLInputElement>('brush');
  const brushValue = byId<HTMLElement>('brush-value');
  const moreBtn = byId<HTMLButtonElement>('more');
  const lessBtn = byId<HTMLButtonElement>('less');
  const sceneBtn = byId<HTMLButtonElement>('scene-button');
  const sceneMenu = byId<HTMLElement>('scene-menu');
  const sceneFile = byId<HTMLInputElement>('scene-file');
  const helpBtn = byId<HTMLButtonElement>('help-button');
  const help = byId<HTMLElement>('help');
  const helpClose = byId<HTMLButtonElement>('help-close');

  const palette = new Palette(byId<HTMLElement>('palette'), state, discovery, toast);
  const selectTool = (id: MaterialId): void => void palette.select(id);

  // --- zoom: a small readout in the corner while zoomed in (click the number to see the whole grid)
  const zoomBox = byId<HTMLDivElement>('zoom');
  const zoomReset = byId<HTMLButtonElement>('zoom-reset');
  byId<HTMLButtonElement>('zoom-in').addEventListener('click', () => view.zoomIn());
  byId<HTMLButtonElement>('zoom-out').addEventListener('click', () => view.zoomOut());
  zoomReset.addEventListener('click', () => view.reset());
  view.onChange(() => {
    zoomBox.hidden = view.zoom === 1;
    zoomReset.textContent = `${view.zoom < 10 ? view.zoom.toFixed(1).replace(/\.0$/, '') : Math.round(view.zoom)}×`;
  });

  // --- drawing tools, beside the material tabs
  const svg = (body: string): string =>
    `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const drawTools: readonly (readonly [DrawTool, string, string, string])[] = [
    ['brush', 'B', 'Brush: draw freehand', svg('<path d="M4 18c3-1 3-6 6-6s2 5 5 4 3-7 5-9" />')],
    ['line', 'L', 'Line: drag a straight line', svg('<path d="M5 19 19 5" />')],
    ['box', 'R', 'Box: drag out a rectangle', svg('<rect x="4.5" y="6" width="15" height="12" rx="1" />')],
    ['circle', 'O', 'Circle: drag out from the centre', svg('<circle cx="12" cy="12" r="7.5" />')],
    ['replace', 'X', 'Replace: swap the material you start on for the selected one', svg('<path d="M5 8h12l-3-3M19 16H7l3 3" />')],
  ];
  const toolRow = byId<HTMLDivElement>('draw-tools');
  const toolButtons = new Map<DrawTool, HTMLButtonElement>();
  for (const [id, key, label, icon] of drawTools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon;
    b.title = `${label} (Shift+${key})`;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => setDrawTool(id));
    toolRow.append(b);
    toolButtons.set(id, b);
  }
  const gap = document.createElement('span');
  gap.className = 'tool-gap';
  const fillBtn = document.createElement('button');
  fillBtn.type = 'button';
  fillBtn.innerHTML = svg('<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none" opacity="0.85" />');
  fillBtn.title = 'Filled boxes and circles, or just outlines (Shift+F)';
  fillBtn.setAttribute('aria-label', 'Filled shapes');
  fillBtn.addEventListener('click', () => setFill(!state.fill));
  toolRow.append(gap, fillBtn);
  const setDrawTool = (tool: DrawTool): void => {
    state.drawTool = tool;
    for (const [id, b] of toolButtons) b.setAttribute('aria-pressed', String(id === tool));
  };
  const setFill = (fill: boolean): void => {
    state.fill = fill;
    fillBtn.setAttribute('aria-pressed', String(fill));
  };
  setDrawTool(state.drawTool);
  setFill(state.fill);

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
    if (reward) sound.reward();
    else sound.discovery();
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
  // Heat view's legend: the colours it gives temperatures from deep cold to white heat, evenly
  // spaced (the scale itself isn't linear, so each label sits under its own colour).
  const legend = byId<HTMLDivElement>('heat-legend');
  const legendTemps = [-30, 0, 20, 100, 300, 600, 1200, 2000];
  legend.querySelector<HTMLDivElement>('.heat-bar')!.style.background = `linear-gradient(to right, ${legendTemps
    .map((t, k) => `${heatColour(t)} ${((k / (legendTemps.length - 1)) * 100).toFixed(1)}%`)
    .join(', ')})`;
  legend.querySelector<HTMLDivElement>('.heat-labels')!.append(
    ...legendTemps.map((t) => {
      const span = document.createElement('span');
      span.textContent = `${t < 0 ? '−' : ''}${Math.abs(t)}°`;
      return span;
    }),
  );
  const toggleHeat = (): void => {
    state.heatView = !state.heatView;
    heatBtn.setAttribute('aria-pressed', String(state.heatView));
    legend.hidden = !state.heatView;
  };

  playBtn.addEventListener('click', togglePause);
  stepBtn.addEventListener('click', step);
  clearBtn.addEventListener('click', () => {
    history.push();
    world.clear();
  });
  heatBtn.addEventListener('click', toggleHeat);
  // Phones: the downward chevron opens the extra controls, the upward one folds them away again.
  const setExpanded = (open: boolean): void => {
    toolbar.classList.toggle('expanded', open);
    moreBtn.setAttribute('aria-expanded', String(open));
    (open ? lessBtn : moreBtn).focus();
  };
  moreBtn.addEventListener('click', () => setExpanded(true));
  lessBtn.addEventListener('click', () => setExpanded(false));

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
    opt.selected = Number.isNaN(value) ? world.gusty : !world.gusty && value === world.wind;
    windSel.append(opt);
  }
  windSel.addEventListener('change', () => {
    const value = Number(windSel.value);
    world.gusty = Number.isNaN(value);
    world.wind = world.gusty ? 0 : value;
  });

  for (const [label, value] of SUNS) {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = label;
    opt.selected = Number.isNaN(value) ? world.dayLength > 0 : world.dayLength === 0 && value === world.sun;
    sunSel.append(opt);
  }
  sunSel.addEventListener('change', () => {
    const value = Number(sunSel.value);
    if (Number.isNaN(value)) {
      // Start at sunrise.
      world.dayLength = DAY_LENGTH;
      world.dayClock = 0;
      world.sun = 0;
    } else {
      world.dayLength = 0;
      world.sun = value;
    }
  });

  // Edges: walls (the default) or open, so things fall and flow out of the grid.
  const syncEdges = (): void => {
    edgesBtn.setAttribute('aria-pressed', String(world.openEdges));
    edgesBtn.title = world.openEdges
      ? 'Edges: open (things fall off the bottom and flow out of the sides). Click to make them walls again'
      : 'Edges: walls. Click to open them, so things fall off the bottom and flow out of the sides';
  };
  edgesBtn.addEventListener('click', () => {
    world.openEdges = !world.openEdges;
    syncEdges();
  });
  syncEdges();

  const syncSound = (): void => soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  soundBtn.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    syncSound();
  });
  syncSound();

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
    undo: async () => (history.undo() ? undefined : 'Nothing to undo'),
    redo: async () => (history.redo() ? undefined : 'Nothing to redo'),
    load: async () => {
      history.push();
      return (await loadFromBrowser(world)) ? 'Scene loaded' : 'No saved scene yet';
    },
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
  // Example scenes, listed under their heading at the bottom of the menu. Loading one can be undone.
  const examplesHeading = byId<HTMLElement>('examples-heading');
  for (const example of [...EXAMPLES].reverse()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = example.name;
    b.addEventListener('click', () => {
      setMenu(false);
      history.push();
      world.clear();
      example.build(world);
      toast(example.hint, 8000);
    });
    examplesHeading.after(b);
  }
  for (const item of sceneMenu.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
    const action = actions[item.dataset.action ?? ''];
    if (action) item.addEventListener('click', () => void run(action));
  }
  sceneFile.addEventListener('change', () => {
    const file = sceneFile.files?.[0];
    sceneFile.value = '';
    if (file) void run(async () => {
      history.push();
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

  const shiftKeys: Record<string, DrawTool> = { b: 'brush', l: 'line', r: 'box', o: 'circle', x: 'replace' };

  window.addEventListener('keydown', (e) => {
    // Undo and redo: Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z (Cmd on a Mac).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'y') {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) history.redo();
        else history.undo();
      }
      return;
    }
    if (e.altKey) return;
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) {
      if (e.key !== ' ' && e.key !== 'Escape') return;
    }
    const key = e.key.toLowerCase();
    const tool = keyToTool.get(key);
    if (key === '=' || key === '+') {
      view.zoomIn();
    } else if (key === '_') {
      view.zoomOut();
    } else if (view.zoom > 1 && key.startsWith('arrow')) {
      const d = 40;
      view.panBy(key === 'arrowleft' ? d : key === 'arrowright' ? -d : 0, key === 'arrowup' ? d : key === 'arrowdown' ? -d : 0);
    } else if (e.shiftKey && shiftKeys[key]) {
      setDrawTool(shiftKeys[key]);
    } else if (e.shiftKey && key === 'f') {
      setFill(!state.fill);
    } else if (tool !== undefined) {
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
