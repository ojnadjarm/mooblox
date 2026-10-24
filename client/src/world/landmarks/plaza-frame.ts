import { OctahedronGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LookPalette } from '../look';
import { bakeAo, box, facet, lathe } from './shapes';

/** One planter run round a plaza: from angle `a0` to `a1` (radians, a0 < a1). */
export interface FrameArc {
  readonly a0: number;
  readonly a1: number;
}

/** Ring sizes of a plaza frame (metres): inner and outer radius, kerb height. */
export interface FrameRing {
  readonly r0: number;
  readonly r1: number;
  readonly h: number;
}

const TAU = Math.PI * 2;
/** Clipped hedge block length along the arc and gap between blocks (metres). */
const BLOCK = 1.25;
const BLOCK_GAP = 0.35;
const FLOWERS = [0xf06c8a, 0xf6c445, 0x9a7be0, 0xfff4e0];

/**
 * The planter runs of a ring round a plaza: the circle minus an opening of `open` radians either side of every entry bearing,
 * cut into runs of at most `run` radians with `gap` radians between them (walk-through gaps); slivers under `run / 3` are dropped.
 */
export function frameArcs(entries: readonly number[], open: number, run: number, gap: number): FrameArc[] {
  const sorted = entries.map((a) => ((a % TAU) + TAU) % TAU).sort((x, y) => x - y);
  const free: [number, number][] = sorted.length
    ? sorted.map((a, i) => [a + open, (sorted[(i + 1) % sorted.length]! + (i + 1 === sorted.length ? TAU : 0)) - open])
    : [[0, TAU - gap]];
  const out: FrameArc[] = [];
  for (const [from, to] of free) {
    const len = to - from;
    if (len < run / 3) continue;
    const n = Math.max(1, Math.ceil((len + gap) / (run + gap)));
    const piece = (len - (n - 1) * gap) / n;
    for (let k = 0; k < n; k++) out.push({ a0: from + k * (piece + gap), a1: from + k * (piece + gap) + piece });
  }
  return out;
}

/**
 * A raised planter run on `ring` from a0 to a1, in plaza-local metres: terracotta kerb walls, cream cap rim, soil, puffy clipped
 * hedge blocks with flowers between, and a cream square post at each end, merged. Kerb and posts crisp, hedges soft (bible §5).
 */
export function planterRun(arc: FrameArc, ring: FrameRing, p: LookPalette, random: () => number): BufferGeometry {
  const { r0, r1, h } = ring;
  const sweep = arc.a1 - arc.a0;
  const mid = (r0 + r1) / 2;
  const sides = Math.max(2, Math.ceil((sweep * r1) / 0.6));
  // Lathe angles run from +z towards +x; plaza angles from +x towards +z.
  const turn = Math.PI / 2 - arc.a1;
  const ring2 = (profile: readonly (readonly [number, number])[], colour: number, soft = false) => lathe(profile, sides, colour, 0, 0, 0, soft, turn, sweep);
  const parts = [
    bakeAo(ring2([[r1, 0], [r1, h]], p.path[1] ?? p.dirt), 0, 0.35, 0.35),
    bakeAo(ring2([[r0, h], [r0, 0]], p.path[1] ?? p.dirt), 0, 0.35, 0.35),
    ring2([[r1 + 0.05, h], [r1 + 0.05, h + 0.09], [r1 - 0.13, h + 0.09]], p.trim),
    ring2([[r0 + 0.13, h + 0.09], [r0 - 0.05, h + 0.09], [r0 - 0.05, h]], p.trim),
    ring2([[r1 - 0.13, h + 0.04], [r0 + 0.13, h + 0.04]], p.dirtDark),
  ];
  const at = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
  const yaw = (a: number) => -a;
  const depth = r1 - r0;
  for (const a of [arc.a0, arc.a1]) {
    const [x, z] = at(a, mid);
    const post = box(depth + 0.16, h + 0.32, 0.46, p.trim, 0, 0, 0);
    const cap = box(depth + 0.26, 0.09, 0.56, p.trimShade, 0, h + 0.32, 0);
    for (const g of [bakeAo(post, 0, 0.3, 0.3), cap]) parts.push(g.rotateY(yaw(a)).translate(x, 0, z));
  }
  const usable = sweep * mid - 0.5;
  const blocks = Math.max(1, Math.floor((usable + BLOCK_GAP) / (BLOCK + BLOCK_GAP)));
  const len = (usable - (blocks - 1) * BLOCK_GAP) / blocks;
  const width = depth - 0.3;
  for (let k = 0; k < blocks; k++) {
    const s = 0.25 + k * (len + BLOCK_GAP) + len / 2;
    const a = arc.a0 + s / mid;
    const [x, z] = at(a, mid);
    const hh = 0.62 + random() * 0.16;
    const hedge = lathe([[1, 0], [1.05, 0.4], [0.94, 0.78], [0.6, 0.97], [0, 1]], 4, p.leaves[0] ?? p.grass, 0, 0, 0, true, Math.PI / 4)
      .scale(width / Math.SQRT2, hh, len / Math.SQRT2);
    parts.push(bakeAo(hedge, 0, 0.25, 0.4).rotateY(yaw(a)).translate(x, h + 0.04, z));
    if (k === blocks - 1) break;
    const ga = a + (len / 2 + BLOCK_GAP / 2) / mid;
    for (let f = 0; f < 3; f++) {
      const [fx, fz] = at(ga + (random() - 0.5) * (BLOCK_GAP * 0.6) / mid, mid + (f - 1) * width * 0.32);
      const colour = FLOWERS[Math.floor(random() * FLOWERS.length)]!;
      parts.push(facet(new OctahedronGeometry(0.13, 0), colour, fx, h + 0.17, fz));
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}

/**
 * Footprint circles (x, z, r) along a run, plaza-local: overlapping cover for occupancy, or `apart` (centres at least 2r apart,
 * none overlapping) for the obstacle list.
 */
export function runFootprint(arc: FrameArc, ring: FrameRing, apart = false): { x: number; z: number; r: number }[] {
  const mid = (ring.r0 + ring.r1) / 2;
  const r = (ring.r1 - ring.r0) / 2 + 0.1;
  const len = (arc.a1 - arc.a0) * mid;
  const n = apart ? Math.floor(len / (2 * r * 1.001)) + 1 : Math.max(2, Math.ceil(len / r) + 1);
  return Array.from({ length: n }, (_, i) => {
    const a = n === 1 ? (arc.a0 + arc.a1) / 2 : arc.a0 + ((arc.a1 - arc.a0) * i) / (n - 1);
    return { x: Math.cos(a) * mid, z: Math.sin(a) * mid, r };
  });
}
