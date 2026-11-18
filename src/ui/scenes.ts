/**
 * Saving, loading and sharing scenes in the browser. The sim encodes a scene to bytes
 * (src/sim/scene.ts); this module compresses those bytes with the browser's built-in
 * CompressionStream, turns them into URL-safe text, and moves that text to and from
 * localStorage, files and the page URL's #scene= hash. No servers are involved.
 *
 * Text format: one prefix character, then base64url. 'z' = deflate-raw compressed, 'r' = raw.
 */
import { applyScene, captureScene, decodeScene, encodeScene, type Scene, type World } from '../sim';

const STORAGE_KEY = 'falling-sand.scene';
const HASH_PREFIX = '#scene=';

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function sceneToText(world: World): Promise<string> {
  const raw = encodeScene(captureScene(world));
  if (typeof CompressionStream !== 'undefined') {
    const packed = await transform(raw, new CompressionStream('deflate-raw'));
    if (packed.length < raw.length) return 'z' + toBase64Url(packed);
  }
  return 'r' + toBase64Url(raw);
}

export async function textToScene(text: string): Promise<Scene> {
  const t = text.trim();
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(t.slice(1));
  } catch {
    throw new Error('Not a falling-sand scene');
  }
  if (t[0] === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed scenes');
    try {
      bytes = await transform(bytes, new DecompressionStream('deflate-raw'));
    } catch {
      throw new Error('Scene data is corrupt');
    }
  } else if (t[0] !== 'r') {
    throw new Error('Not a falling-sand scene');
  }
  return decodeScene(bytes);
}

/** Save to this browser's localStorage. */
export async function saveToBrowser(world: World): Promise<void> {
  localStorage.setItem(STORAGE_KEY, await sceneToText(world));
}

/** Load from localStorage. Returns false if nothing is saved. */
export async function loadFromBrowser(world: World): Promise<boolean> {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return false;
  applyScene(world, await textToScene(text));
  return true;
}

/** Download the scene as a small text file. */
export async function downloadScene(world: World): Promise<void> {
  const blob = new Blob([await sceneToText(world)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'falling-sand-scene.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function loadFromFile(world: World, file: File): Promise<void> {
  applyScene(world, await textToScene(await file.text()));
}

/**
 * Put the scene in the page URL (without reloading) and return that URL. The link works
 * wherever the game is hosted, because it's built from the current page address.
 */
export async function shareLink(world: World): Promise<string> {
  const hash = HASH_PREFIX + (await sceneToText(world));
  history.replaceState(null, '', hash);
  return location.href;
}

/** If the page was opened with a #scene= link, load it. Returns true if a scene was loaded. */
export async function loadFromHash(world: World): Promise<boolean> {
  if (!location.hash.startsWith(HASH_PREFIX)) return false;
  applyScene(world, await textToScene(location.hash.slice(HASH_PREFIX.length)));
  return true;
}
