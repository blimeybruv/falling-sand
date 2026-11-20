/** Entry point: wires the simulation, renderer and UI together and runs the frame loop. */
import { World } from './sim';
import { Renderer } from './render/renderer';
import { PointerInput } from './ui/input';
import { setupControls, toast } from './ui/controls';
import { loadFromHash } from './ui/scenes';
import { createState } from './ui/state';
import { loadDiscovery, loadMode } from './ui/progress';
import { Sound } from './ui/sound';

/** The grid is sized to the window at load, up to roughly this many cells (the performance budget). */
const TARGET_CELLS = 80_000;
/** Smallest on-screen size of a cell, in CSS pixels. */
const MIN_CELL_PX = 3;
/** Simulation ticks per second at 1× speed. */
const TICK_HZ = 60;
/** Never run more than this many sim steps in one animation frame (avoids a spiral on slow devices). */
const MAX_STEPS_PER_FRAME = 4;

const stage = document.getElementById('stage') as HTMLElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const fps = document.getElementById('fps') as HTMLElement;

function gridSize(): [number, number] {
  const w = Math.max(200, stage.clientWidth);
  const h = Math.max(200, stage.clientHeight);
  const cell = Math.max(MIN_CELL_PX, Math.sqrt((w * h) / TARGET_CELLS));
  return [Math.max(60, Math.floor(w / cell)), Math.max(60, Math.floor(h / cell))];
}

const [cols, rows] = gridSize();
const world = new World(cols, rows, (Math.random() * 2 ** 32) >>> 0);
const renderer = new Renderer(canvas, world);
const state = createState(loadMode());
const discovery = loadDiscovery();
const input = new PointerInput(canvas, world, state);
const sound = new Sound();
const controls = setupControls(state, world, discovery, sound);
loadFromHash(world).then(
  (loaded) => loaded && toast('Loaded shared scene'),
  (err: unknown) => toast(`Couldn't load the shared scene: ${err instanceof Error ? err.message : err}`),
);

/** Scale the canvas to fit the stage, keeping cells square. */
function fit(): void {
  const scale = Math.min(stage.clientWidth / cols, stage.clientHeight / rows);
  canvas.style.width = `${Math.floor(cols * scale)}px`;
  canvas.style.height = `${Math.floor(rows * scale)}px`;
}
// The stage changes size with the window and when the mobile toolbar folds open.
new ResizeObserver(fit).observe(stage);
fit();

let last = performance.now();
let acc = 0;
let frames = 0;
let fpsTime = last;

function frame(now: number): void {
  const dt = Math.min(100, now - last);
  last = now;

  input.apply();

  if (!state.paused) {
    acc += (dt / 1000) * TICK_HZ * state.speed;
    let steps = 0;
    while (acc >= 1 && steps < MAX_STEPS_PER_FRAME) {
      world.step();
      acc -= 1;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  } else {
    acc = 0;
    for (; state.pendingSteps > 0; state.pendingSteps--) world.step();
  }

  const c = input.cursor();
  controls.checkDiscoveries();
  sound.update(world.wind, !state.paused);

  renderer.render(world, { heatView: state.heatView, cursor: c && { x: c.x, y: c.y, radius: state.brush } });

  frames++;
  if (now - fpsTime >= 500) {
    fps.textContent = `${Math.round((frames * 1000) / (now - fpsTime))} fps · ${cols}×${rows}`;
    frames = 0;
    fpsTime = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
