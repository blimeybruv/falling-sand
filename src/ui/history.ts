/**
 * Undo and redo: snapshots of the grid's materials, taken just before each change you make (a
 * stroke, a shape, Clear, loading a scene). Undo puts the grid back as it was before your last
 * change; like loading a scene, temperatures and lifetimes start afresh. Only materials (and pinned
 * powders) are kept, a byte or two a cell, so even the largest grid costs under 200 KB a snapshot.
 */
import { applyScene, captureScene, type Scene, type World } from '../sim';

/** How many changes back you can undo. */
const MAX_UNDO = 30;

export class History {
  private readonly undoStack: Scene[] = [];
  private readonly redoStack: Scene[] = [];

  constructor(private readonly world: World) {}

  /** Remember the grid as it is now, before a change. Clears what could be redone. */
  push(): void {
    this.undoStack.push(captureScene(this.world));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Go back to before the last change. Returns false if there's nothing to undo. */
  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    this.redoStack.push(captureScene(this.world));
    this.restore(snapshot);
    return true;
  }

  /** Put back the last change undone. Returns false if there's nothing to redo. */
  redo(): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;
    this.undoStack.push(captureScene(this.world));
    this.restore(snapshot);
    return true;
  }

  private restore(scene: Scene): void {
    applyScene(this.world, scene);
  }
}
