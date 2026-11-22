/**
 * Undo and redo: snapshots of the grid's materials, taken just before each change you make (a
 * stroke, a shape, Clear, loading a scene). Undo puts the grid back as it was before your last
 * change; like loading a scene, temperatures and lifetimes start afresh. Only materials are kept,
 * one byte a cell, so even the largest grid costs under 100 KB a snapshot.
 */
import type { MaterialId, World } from '../sim';

/** How many changes back you can undo. */
const MAX_UNDO = 30;

export class History {
  private readonly undoStack: Uint8Array[] = [];
  private readonly redoStack: Uint8Array[] = [];

  constructor(private readonly world: World) {}

  /** Remember the grid as it is now, before a change. Clears what could be redone. */
  push(): void {
    this.undoStack.push(this.world.mat.slice());
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
    this.redoStack.push(this.world.mat.slice());
    this.restore(snapshot);
    return true;
  }

  /** Put back the last change undone. Returns false if there's nothing to redo. */
  redo(): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;
    this.undoStack.push(this.world.mat.slice());
    this.restore(snapshot);
    return true;
  }

  private restore(mat: Uint8Array): void {
    const { world } = this;
    world.clear();
    for (let i = 0; i < mat.length; i++) if (mat[i] !== 0) world.setCell(i, mat[i] as MaterialId);
  }
}
