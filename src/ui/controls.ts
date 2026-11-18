/**
 * Toolbar, material palette, help panel and keyboard shortcuts.
 * Builds the palette from the material table, so new materials appear automatically.
 */
import { M, PALETTE, type MaterialId, type World } from '../sim';
import { swatchColour } from '../render/renderer';
import { MAX_BRUSH, MIN_BRUSH, SPEEDS, type GameState } from './state';

const ERASER_KEY = 'e';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

export function setupControls(state: GameState, world: World): void {
  const palette = byId<HTMLElement>('palette');
  const playBtn = byId<HTMLButtonElement>('play');
  const stepBtn = byId<HTMLButtonElement>('step');
  const clearBtn = byId<HTMLButtonElement>('clear');
  const speedSel = byId<HTMLSelectElement>('speed');
  const brush = byId<HTMLInputElement>('brush');
  const brushValue = byId<HTMLElement>('brush-value');
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

  playBtn.addEventListener('click', togglePause);
  stepBtn.addEventListener('click', step);
  clearBtn.addEventListener('click', () => world.clear());

  for (const s of SPEEDS) {
    const opt = document.createElement('option');
    opt.value = String(s);
    opt.textContent = `${s}×`;
    opt.selected = s === state.speed;
    speedSel.append(opt);
  }
  speedSel.addEventListener('change', () => (state.speed = Number(speedSel.value)));

  brush.min = String(MIN_BRUSH);
  brush.max = String(MAX_BRUSH);
  brush.addEventListener('input', () => setBrush(Number(brush.value)));
  setBrush(state.brush);
  syncPlay();

  // Don't leave buttons focused, or Space would "click" them as well as toggling pause.
  document.addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('button')) (e.target.closest('button') as HTMLElement).blur();
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
    if (e.target instanceof HTMLSelectElement) return;
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
    } else if (key === '?' || key === 'h') {
      setHelp(!helpOpen());
    } else if (key === 'escape') {
      setHelp(false);
    } else {
      return;
    }
    e.preventDefault();
  });
}
