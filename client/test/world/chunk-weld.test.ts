import { describe, expect, it } from 'vitest';
import { BoxGeometry } from 'three';
import { weldChunks, type WeldedMesh } from '../../src/world/chunk-weld';
import type { MeshArrays } from '../../src/world/district-merge';

/** n boxes side by side as one non-indexed mesh (36 vertices each, 24 distinct). */
function boxes(n: number, surface = false): MeshArrays {
  const one = new BoxGeometry(1, 1, 1).toNonIndexed();
  const p = one.getAttribute('position').array as Float32Array;
  const q = one.getAttribute('normal').array as Float32Array;
  const position = new Float32Array(n * p.length);
  const normal = new Float32Array(n * q.length);
  for (let b = 0; b < n; b++) {
    for (let i = 0; i < p.length; i += 3) position.set([p[i]! + b * 2, p[i + 1]!, p[i + 2]!], b * p.length + i);
    normal.set(q, b * q.length);
  }
  const v = position.length / 3;
  const color = new Float32Array(v * 3).fill(0.5);
  return { position, normal, color, colorSize: 3, sway: new Float32Array(v), surface: surface ? new Float32Array(v).fill(2) : null };
}

/** Every attribute of source vertex i of a welded mesh, read through its chunk's index. */
function vertex(w: WeldedMesh, i: number): number[] {
  let c = 0;
  while (i >= w.chunks[c + 2]! + w.chunks[c + 3]!) c += 4;
  const v = w.chunks[c]! + w.index[i]!;
  const out = [...w.position.subarray(v * 3, v * 3 + 3), ...w.normal.subarray(v * 3, v * 3 + 3), ...w.color.subarray(v * 3, v * 3 + 3), w.sway[v]!];
  if (w.surface) out.push(w.surface[v]!);
  return out;
}

function run(m: MeshArrays, chunk: number): WeldedMesh {
  const g = weldChunks(m, chunk);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

describe('chunk weld', () => {
  it('stores each distinct vertex once and draws the same triangles through the index', () => {
    const m = boxes(3, true);
    const w = run(m, 1 << 16);
    expect(w.position.length / 3).toBe(3 * 24);
    expect(w.index.length).toBe(3 * 36);
    for (let i = 0; i < 3 * 36; i++) {
      expect(vertex(w, i)).toEqual([...m.position.subarray(i * 3, i * 3 + 3), ...m.normal.subarray(i * 3, i * 3 + 3), ...m.color.subarray(i * 3, i * 3 + 3), m.sway[i]!, m.surface![i]!]);
    }
  });

  it('welds within each chunk only: indices stay local and every chunk keeps its own source vertex run', () => {
    const m = boxes(5);
    const w = run(m, 72);
    expect(Array.from(w.chunks)).toEqual([0, 48, 0, 72, 48, 48, 72, 72, 96, 24, 144, 36]);
    for (let c = 0; c < w.chunks.length; c += 4) {
      const local = w.index.subarray(w.chunks[c + 2]!, w.chunks[c + 2]! + w.chunks[c + 3]!);
      expect(Math.max(...local)).toBe(w.chunks[c + 1]! - 1);
    }
    for (let i = 0; i < 5 * 36; i++) expect(vertex(w, i).slice(0, 3)).toEqual(Array.from(m.position.subarray(i * 3, i * 3 + 3)));
    expect(w.surface).toBeNull();
  });

  it('keeps vertices apart that differ in any attribute', () => {
    const m = boxes(1);
    // Vertex 1 is shared with vertex 3 (the face's second triangle): a sway of its own splits them.
    m.sway[1] = 0.5;
    expect(run(m, 1 << 16).position.length / 3).toBe(25);
  });
});
