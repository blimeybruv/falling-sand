import { M, type MaterialId } from '../sim';
import type { Mode } from './progress';

/** Speeds offered in the speed menu, in simulation steps per 60 Hz tick. */
export const SPEEDS = [0.25, 0.5, 1, 2, 3] as const;
/** Wind settings offered in the wind menu: label and World.wind value. */
export const WINDS: readonly (readonly [string, number])[] = [
  ['← Strong', -1],
  ['← Light', -0.4],
  ['Off', 0],
  ['Light →', 0.4],
  ['Strong →', 1],
];
/** Sun settings offered in the sun menu: label and World.sun value. */
export const SUNS: readonly (readonly [string, number])[] = [
  ['Off', 0],
  ['Weak', 0.5],
  ['Strong', 1],
];
export const MIN_BRUSH = 0;
export const MAX_BRUSH = 30;

/** Everything the controls change and the main loop reads. (Wind and sun live on the World.) */
export interface GameState {
  /** Selected material; M.Empty means the eraser. */
  tool: MaterialId;
  brush: number;
  paused: boolean;
  speed: number;
  /** Frames to step while paused (set by the Step button / key). */
  pendingSteps: number;
  /** Show temperatures instead of materials. */
  heatView: boolean;
  /** Discovery: unlock materials by making them. Sandbox: everything available. */
  mode: Mode;
}

export function createState(mode: Mode): GameState {
  return { tool: M.Sand, brush: 4, paused: false, speed: 1, pendingSteps: 0, heatView: false, mode };
}
