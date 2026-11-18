/**
 * Scenes: the materials in a grid, encoded compactly for saving, files and share links.
 *
 * Format (version 1), all integers little-endian:
 *   'F' 'S'  magic
 *   u8       version (1)
 *   u16      width
 *   u16      height
 *   runs     repeated [u8 material id][varint run length], covering width * height cells row by row
 *
 * Only materials are stored. Lifetimes, shades and temperatures are regenerated when the scene is
 * placed, as if every particle had just been drawn. Unknown material ids load as Empty, so scenes
 * saved by a newer version with extra materials still open.
 */
import { M, type MaterialId } from './ids';
import { MATERIALS } from './materials';
import type { World } from './world';

const VERSION = 1;
const MAX_SIDE = 4096;

export interface Scene {
  width: number;
  height: number;
  /** One material id per cell, row by row. */
  mat: Uint8Array;
}

/** Snapshot the materials in a world. */
export function captureScene(world: World): Scene {
  return { width: world.width, height: world.height, mat: world.mat.slice() };
}

export function encodeScene(scene: Scene): Uint8Array {
  const out: number[] = [0x46, 0x53, VERSION];
  out.push(scene.width & 0xff, scene.width >> 8, scene.height & 0xff, scene.height >> 8);
  const { mat } = scene;
  let i = 0;
  while (i < mat.length) {
    const m = mat[i];
    let run = 1;
    while (i + run < mat.length && mat[i + run] === m) run++;
    out.push(m);
    // varint: 7 bits per byte, high bit set on all but the last byte
    let n = run;
    while (n >= 0x80) {
      out.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    out.push(n);
    i += run;
  }
  return Uint8Array.from(out);
}

/** Decode bytes from encodeScene. Throws an Error with a readable message if they aren't a scene. */
export function decodeScene(bytes: Uint8Array): Scene {
  if (bytes.length < 7 || bytes[0] !== 0x46 || bytes[1] !== 0x53) throw new Error('Not a falling-sand scene');
  if (bytes[2] !== VERSION) throw new Error(`Unsupported scene version ${bytes[2]}`);
  const width = bytes[3] | (bytes[4] << 8);
  const height = bytes[5] | (bytes[6] << 8);
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) throw new Error('Scene has an invalid size');

  const size = width * height;
  const mat = new Uint8Array(size);
  let p = 7;
  let i = 0;
  while (i < size) {
    if (p >= bytes.length) throw new Error('Scene data is truncated');
    const raw = bytes[p++];
    const m = raw < MATERIALS.length ? raw : M.Empty;
    let run = 0;
    let shift = 0;
    for (;;) {
      if (p >= bytes.length || shift > 28) throw new Error('Scene data is truncated');
      const b = bytes[p++];
      run |= (b & 0x7f) << shift;
      if (b < 0x80) break;
      shift += 7;
    }
    if (run < 1 || i + run > size) throw new Error('Scene data is corrupt');
    mat.fill(m, i, i + run);
    i += run;
  }
  return { width, height, mat };
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
      if (m !== M.Empty) world.setCell(wy * world.width + wx, m as MaterialId);
    }
  }
}
