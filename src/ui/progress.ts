/** Saves the game mode and Discovery progress in localStorage (silently skipped if unavailable). */
import { Discovery } from '../sim';

export type Mode = 'discovery' | 'sandbox';

const MODE_KEY = 'falling-sand.mode';
const SORT_KEY = 'falling-sand.sort';
const PROGRESS_KEY = 'falling-sand.discovered';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private browsing, etc.): progress just won't persist.
  }
}

/** Discovery is the default for new players. */
export function loadMode(): Mode {
  return read(MODE_KEY) === 'sandbox' ? 'sandbox' : 'discovery';
}

export function saveMode(mode: Mode): void {
  write(MODE_KEY, mode);
}

export function loadDiscovery(): Discovery {
  try {
    const saved: unknown = JSON.parse(read(PROGRESS_KEY) ?? '[]');
    return new Discovery(Array.isArray(saved) ? saved.filter((v): v is number => typeof v === 'number') : []);
  } catch {
    return new Discovery();
  }
}

export function saveDiscovery(discovery: Discovery): void {
  write(PROGRESS_KEY, JSON.stringify(discovery.toJSON()));
}

/** Whether the palette is sorted A-Z (otherwise it's in its usual order, grouped by kind). */
export function loadSortAZ(): boolean {
  return read(SORT_KEY) === 'az';
}

export function saveSortAZ(az: boolean): void {
  write(SORT_KEY, az ? 'az' : 'default');
}
