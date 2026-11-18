import { M, type MaterialId } from '../sim';

/** Speeds offered in the speed menu, in simulation steps per 60 Hz tick. */
export const SPEEDS = [0.25, 0.5, 1, 2, 3] as const;
export const MIN_BRUSH = 0;
export const MAX_BRUSH = 30;

/** Everything the controls change and the main loop reads. */
export interface GameState {
  /** Selected material; M.Empty means the eraser. */
  tool: MaterialId;
  brush: number;
  paused: boolean;
  speed: number;
  /** Frames to step while paused (set by the Step button / key). */
  pendingSteps: number;
}

export function createState(): GameState {
  return { tool: M.Sand, brush: 4, paused: false, speed: 1, pendingSteps: 0 };
}
