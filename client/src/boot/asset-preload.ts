import { DefaultLoadingManager } from 'three';

const GZIP = [0x1f, 0x8b];
const GLTF = [0x67, 0x6c, 0x54, 0x46];

/** Starts the downloads of `files` under `base` at once as gzip copies and serves the inflated bytes to every three.js loader. */
export function preloadAssets(base: string, files: readonly string[]): Promise<void> {
  const ready = new Map<string, string>();
  DefaultLoadingManager.setURLModifier((url) => ready.get(url) ?? url);
  return Promise.all(
    files.map(async (file) => {
      const blob = await inflated(`${base}${file}`).catch(() => null);
      if (blob) ready.set(`${base}${file}`, URL.createObjectURL(blob));
    }),
  ).then(() => undefined);
}

/** The glb behind `<url>.gz`, or null when there is none (the loader then fetches `url` itself). */
export async function inflated(url: string): Promise<Blob | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  const res = await fetch(`${url}.gz`);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A server that sends the .gz with Content-Encoding hands over the glb already inflated.
  if (starts(bytes, GLTF)) return new Blob([bytes]);
  if (!starts(bytes, GZIP)) return null;
  const glb = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return starts(glb, GLTF) ? new Blob([glb]) : null;
}

function starts(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}
