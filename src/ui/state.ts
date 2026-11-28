import { M, type MaterialId } from '../sim';
import type { Mode } from './progress';

/** Speeds offered in the speed menu, in simulation steps per 60 Hz tick. */
export const SPEEDS = [0.25, 0.5, 1, 2, 3] as const;
/** Wind settings offered in the wind menu: label and World.wind value; NaN means gusty (World.gusty). */
export const WINDS: readonly (readonly [string, number])[] = [
  ['← Strong', -1],
  ['← Light', -0.4],
  ['Off', 0],
  ['Light →', 0.4],
  ['Strong →', 1],
  ['Gusty', NaN],
];
/** Sun settings offered in the sun menu: label and World.sun value (below 0: a clear night); NaN means Day and night. */
export const SUNS: readonly (readonly [string, number])[] = [
  ['Off', 0],
  ['Weak', 0.5],
  ['Strong', 1],
  ['Night', -1],
  ['Day/night', NaN],
];
/** With Day and night on, frames in a whole day and night: three minutes at normal speed. */
export const DAY_LENGTH = 3 * 60 * 60;
export const MIN_BRUSH = 0;
export const MAX_BRUSH = 30;

/**
 * How the pointer draws: freehand with the brush, a straight line, a box or a circle (dragged out
 * with a preview, drawn when let go), or the replace brush (swaps the material under it for the
 * selected one).
 */
export type DrawTool = 'brush' | 'line' | 'box' | 'circle' | 'replace';

/** Everything the controls change and the main loop reads. (Wind and sun live on the World.) */
export interface GameState {
  /** Selected material; M.Empty means the eraser. */
  tool: MaterialId;
  /** How the pointer draws with it. */
  drawTool: DrawTool;
  /** Boxes and circles are filled, not just outlined. */
  fill: boolean;
  brush: number;
  paused: boolean;
  speed: number;
  /** Frames to step while paused (set by the Step button / key). */
  pendingSteps: number;
  /** Show temperatures instead of materials. */
  heatView: boolean;
  /** Discovery: unlock materials by making them. Sandbox: everything available. */
  mode: Mode;
  /** The keyboard brush's cell (Shift+K), or null when it's off. */
  keyCursor: { x: number; y: number } | null;
  /** Stronger colours and contrast, on the canvas and in the controls (Shift+C). */
  highContrast: boolean;
}

export function createState(mode: Mode): GameState {
  return { tool: M.Sand, drawTool: 'brush', fill: false, brush: 4, paused: false, speed: 1, pendingSteps: 0, heatView: false, mode, keyCursor: null, highContrast: false };
}
