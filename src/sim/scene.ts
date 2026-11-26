/**
 * Scenes: the materials in a grid, encoded compactly for saving, files and share links.
 *
 * Format, all integers little-endian:
 *   'F' 'S'  magic
 *   u8       version (1, or 2 when some cells are pinned)
 *   u16      width
 *   u16      height
 *   runs     repeated [u8 material id][varint run length], covering width * height cells row by row
 *   pins     version 2 only: varint run lengths covering the cells again, alternately loose and
 *            pinned (powders drawn "fixed", which stay put), starting with loose
 *
 * Only materials and pins are stored. Lifetimes, shades and temperatures are regenerated when the
 * scene is placed, as if every particle had just been drawn. Unknown material ids load as Empty, so
 * scenes saved by a newer version with extra materials still open. A scene with nothing pinned is
 * written as version 1, which older copies of the game can still read.
 */
import { M, type MaterialId } from './ids';
import { MATERIALS } from './materials';
import type { World } from './world';

/** The newest version written; decodeScene reads every version up to it. */
const VERSION = 2;
const MAX_SIDE = 4096;

export interface Scene {
  width: number;
  height: number;
  /** One material id per cell, row by row. */
  mat: Uint8Array;
  /** 1 for a pinned cell (see World.pinned), row by row; absent when nothing is pinned. */
  pinned?: Uint8Array;
}

/** Snapshot the materials (and pins) in a world. */
export function captureScene(world: World): Scene {
  const scene: Scene = { width: world.width, height: world.height, mat: world.mat.slice() };
  if (world.pinned.includes(1)) scene.pinned = world.pinned.slice();
  return scene;
}

function pushVarint(out: number[], n: number): void {
  // 7 bits per byte, high bit set on all but the last byte
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

export function encodeScene(scene: Scene): Uint8Array {
  const pinned = scene.pinned && scene.pinned.includes(1) ? scene.pinned : null;
  const out: number[] = [0x46, 0x53, pinned ? 2 : 1];
  out.push(scene.width & 0xff, scene.width >> 8, scene.height & 0xff, scene.height >> 8);
  const { mat } = scene;
  let i = 0;
  while (i < mat.length) {
    const m = mat[i];
    let run = 1;
    while (i + run < mat.length && mat[i + run] === m) run++;
    out.push(m);
    pushVarint(out, run);
    i += run;
  }
  if (pinned) {
    let at = 0;
    let state = 0;
    while (at < pinned.length) {
      let run = 0;
      while (at + run < pinned.length && (pinned[at + run] !== 0 ? 1 : 0) === state) run++;
      pushVarint(out, run);
      at += run;
      state ^= 1;
    }
  }
  return Uint8Array.from(out);
}

/** Decode bytes from encodeScene. Throws an Error with a readable message if they aren't a scene. */
export function decodeScene(bytes: Uint8Array): Scene {
  if (bytes.length < 7 || bytes[0] !== 0x46 || bytes[1] !== 0x53) throw new Error('Not a falling-sand scene');
  const version = bytes[2];
  if (version < 1 || version > VERSION) throw new Error(`Unsupported scene version ${version}`);
  const width = bytes[3] | (bytes[4] << 8);
  const height = bytes[5] | (bytes[6] << 8);
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) throw new Error('Scene has an invalid size');

  const size = width * height;
  const mat = new Uint8Array(size);
  let p = 7;
  const varint = (): number => {
    let n = 0;
    let shift = 0;
    for (;;) {
      if (p >= bytes.length || shift > 28) throw new Error('Scene data is truncated');
      const b = bytes[p++];
      n |= (b & 0x7f) << shift;
      if (b < 0x80) return n;
      shift += 7;
    }
  };
  let i = 0;
  while (i < size) {
    if (p >= bytes.length) throw new Error('Scene data is truncated');
    const raw = bytes[p++];
    const m = raw < MATERIALS.length ? raw : M.Empty;
    const run = varint();
    if (run < 1 || i + run > size) throw new Error('Scene data is corrupt');
    mat.fill(m, i, i + run);
    i += run;
  }
  if (version < 2) return { width, height, mat };
  const pinned = new Uint8Array(size);
  let state = 0;
  i = 0;
  while (i < size) {
    const run = varint();
    // A zero-length run is allowed only first (a scene whose first cell is pinned).
    if ((run < 1 && i > 0) || i + run > size) throw new Error('Scene data is corrupt');
    if (state === 1) pinned.fill(1, i, i + run);
    i += run;
    state ^= 1;
  }
  return { width, height, mat, pinned };
}

/**
 * Replace the world's contents with a scene. If the sizes differ, the scene is centred
 * horizontally and sits on the floor; anything that doesn't fit is cropped.
 */
export function applyScene(world: World, scene: Scene): void {
  world.clear();
  const ox = Math.floor((world.width - scene.width) / 2);
  const oy = world.height - scene.height;
  for (let y = 0; y < scene.height; y++) {
    const wy = y + oy;
    if (wy < 0 || wy >= world.height) continue;
    for (let x = 0; x < scene.width; x++) {
      const wx = x + ox;
      if (wx < 0 || wx >= world.width) continue;
      const m = scene.mat[y * scene.width + x];
      if (m === M.Empty) continue;
      const i = wy * world.width + wx;
      world.setCell(i, m as MaterialId);
      if (scene.pinned && scene.pinned[y * scene.width + x] !== 0 && world.canPin(m as MaterialId)) world.pinned[i] = 1;
    }
  }
}
