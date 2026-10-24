import { BufferAttribute, BufferGeometry, type InterleavedBufferAttribute } from 'three';
import { floats } from './district-prep';

/** A geometry as plain arrays that survive a postMessage (attributes de-interleaved to Float32Arrays). */
export interface PackedGeometry {
  readonly attributes: Record<string, { readonly array: Float32Array; readonly itemSize: number }>;
  readonly index: Uint16Array | Uint32Array | null;
}

/** Packs a geometry for the build worker (the arrays are copied by the structured clone, never transferred). */
export function packGeometry(g: BufferGeometry): PackedGeometry {
  const attributes: Record<string, { array: Float32Array; itemSize: number }> = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    attributes[name] = { array: floats(a as BufferAttribute | InterleavedBufferAttribute), itemSize: a.itemSize };
  }
  return { attributes, index: (g.index?.array as Uint16Array | Uint32Array | undefined) ?? null };
}

/** The geometry back from its packed arrays. */
export function unpackGeometry(p: PackedGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, a] of Object.entries(p.attributes)) g.setAttribute(name, new BufferAttribute(a.array, a.itemSize));
  if (p.index) g.setIndex(new BufferAttribute(p.index, 1));
  return g;
}
