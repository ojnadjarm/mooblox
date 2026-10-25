import type { MeshArrays } from './district-merge';

/** A merged mesh welded chunk by chunk: each distinct vertex stored once, drawn through a 16-bit index per chunk. */
export interface WeldedMesh extends MeshArrays {
  /** One entry per source vertex, in source order; values are local to their chunk's vertices. */
  readonly index: Uint16Array;
  /** Per chunk: first vertex, vertex count, first index, index count. */
  readonly chunks: Uint32Array;
}

/**
 * Welds each `chunk`-vertex run of a non-indexed mesh: vertices equal bit for bit in every attribute are stored once
 * (district meshes repeat each vertex about 2.6 times: fewer bytes to upload, fewer vertex shader runs). Triangle order
 * and every drawn value stay the same. One yield per chunk; `chunk` is at most 65536.
 */
export function* weldChunks(m: MeshArrays, chunk: number): Generator<void, WeldedMesh> {
  const parts: [Float32Array, number][] = [[m.position, 3], [m.normal, 3], [m.color, m.colorSize], [m.sway, 1]];
  if (m.surface) parts.push([m.surface, 1]);
  const src = parts.map(([a]) => new Uint32Array(a.buffer, a.byteOffset, a.length));
  const sizes = parts.map(([, s]) => s);
  const dst = parts.map(([a]) => new Uint32Array(a.length));
  const n = m.position.length / 3;
  const index = new Uint16Array(n);
  const chunks = new Uint32Array(Math.ceil(n / chunk) * 4);
  let size = 1;
  while (size < chunk * 2) size <<= 1;
  const table = new Int32Array(size);
  const mask = size - 1;
  const same = (v: number, w: number): boolean => {
    for (let p = 0; p < src.length; p++) {
      const s = sizes[p]!;
      const a = src[p]!;
      const b = dst[p]!;
      for (let k = 0; k < s; k++) if (a[v * s + k] !== b[w * s + k]) return false;
    }
    return true;
  };
  let used = 0;
  for (let a = 0, c = 0; a < n; a += chunk, c += 4) {
    const b = Math.min(n, a + chunk);
    const first = used;
    table.fill(-1);
    for (let v = a; v < b; v++) {
      let h = 0x811c9dc5;
      for (let p = 0; p < src.length; p++) {
        const s = sizes[p]!;
        const arr = src[p]!;
        for (let k = v * s, e = k + s; k < e; k++) h = Math.imul(h ^ arr[k]!, 0x01000193);
      }
      let slot = (h ^ (h >>> 15)) & mask;
      let local = -1;
      for (let t = table[slot]!; t >= 0; t = table[slot]!) {
        if (same(v, first + t)) {
          local = t;
          break;
        }
        slot = (slot + 1) & mask;
      }
      if (local < 0) {
        local = used - first;
        table[slot] = local;
        for (let p = 0; p < src.length; p++) {
          const s = sizes[p]!;
          dst[p]!.set(src[p]!.subarray(v * s, v * s + s), used * s);
        }
        used++;
      }
      index[v] = local;
    }
    chunks.set([first, used - first, a, b - a], c);
    yield;
  }
  const out = dst.map((d, p) => new Float32Array(d.buffer, 0, used * sizes[p]!));
  return { position: out[0]!, normal: out[1]!, color: out[2]!, colorSize: m.colorSize, sway: out[3]!, surface: m.surface ? out[4]! : null, index, chunks };
}
