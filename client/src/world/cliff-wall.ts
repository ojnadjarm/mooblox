import { BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LookPalette } from './look';
import { bakeAo, facet } from './landmarks/shapes';
import { Surface, type SurfaceId } from './surfaces';

/** Sizes of a designed cliff: column widths, block heights and offsets, chances of notches, strata, moss and toe rocks. */
export interface CliffSize {
  readonly width: readonly [number, number];
  readonly seam: number;
  readonly depth: number;
  readonly upper: readonly [number, number];
  /** Most of the column height the upper block may take (the lower strata keep the rest). */
  readonly upperShare: number;
  readonly upperOut: readonly [number, number];
  readonly step: readonly [number, number];
  readonly notch: number;
  readonly notchDrop: readonly [number, number];
  readonly bulge: readonly [number, number];
  readonly split: number;
  readonly chamfer: number;
  readonly moss: number;
  readonly mossWidth: readonly [number, number];
  readonly mossLength: readonly [number, number];
  readonly toe: number;
  readonly toeRadius: readonly [number, number];
  readonly bush: number;
  /** Block levels below the top sit on a 1 cm grid offset by this (metres): walls with offsets 5 mm apart never z-fight where they meet. */
  readonly level: number;
}

/** Sizes of the designed island cliff (art bible §3: banded, not a straight wall; concepts: stacked stone, moss, rocky toe). */
export const CLIFF: CliffSize = {
  /** Column width along the rim (metres) and the seam left between columns. */
  width: [2, 3.4],
  seam: 0.07,
  /** Depth of each block behind its face. */
  depth: 1.2,
  /** Upper block height and how far its face stands off the rim (the grass lip overhangs it). */
  upper: [0.9, 2],
  upperShare: 0.9,
  upperOut: [-0.05, 0.1],
  /** Each lower block steps out this much from the one above it (strata). */
  step: [0.15, 0.4],
  /** Chance a column's top sits lower (a notch under the lip) and how much lower. */
  notch: 0.35,
  notchDrop: [0.2, 0.7],
  /** How far each block's face juts out at its ridge (two facets per face, chunky stone). */
  bulge: [0.12, 0.35],
  /** Chance the lower part is cut into two strata. */
  split: 0.35,
  chamfer: 0.12,
  moss: 0.6,
  mossWidth: [0.8, 1.8],
  mossLength: [0.5, 1.3],
  toe: 0.45,
  toeRadius: [0.6, 1.3],
  bush: 0.3,
  level: 0,
};

/** The same cliff at terrace scale (0.8-2.6 m raised lawns and landmark terraces): smaller blocks, shallower strata. */
export const TERRACE_CLIFF: CliffSize = {
  ...CLIFF,
  width: [1.1, 1.8],
  depth: 0.7,
  upper: [0.5, 0.95],
  upperShare: 0.7,
  upperOut: [-0.04, 0.06],
  step: [0.08, 0.2],
  notch: 0.3,
  notchDrop: [0.08, 0.22],
  bulge: [0.06, 0.18],
  split: 0.3,
  chamfer: 0.08,
  mossWidth: [0.5, 1.1],
  mossLength: [0.25, 0.6],
  toe: 0.35,
  toeRadius: [0.28, 0.5],
  bush: 0.35,
};

/** An opening in the rim (a stair): centred on angle `at`, `half` radians each side. */
export interface CliffGap {
  readonly at: number;
  readonly half: number;
}

/** One stone block of a column: from y0 to y1, its face `out` metres off the rim, upper (cliffHigh) or lower (cliffLow). */
export interface CliffSlab {
  readonly y0: number;
  readonly y1: number;
  readonly out: number;
  readonly upper: boolean;
  /** Lightness jitter of this block (-1..1). */
  readonly shade: number;
  /** Ridge of the two-facet face: how far it juts out and where along the face it runs (-0.4..0.4 of the half width). */
  readonly bulge: number;
  readonly ridge: number;
}

/** One column of the rim from angle a0 to a1 (radians, x = cos a, z = sin a), top slab first. */
export interface CliffColumn {
  readonly a0: number;
  readonly a1: number;
  readonly slabs: readonly CliffSlab[];
  readonly moss: { readonly w: number; readonly len: number } | null;
  readonly toe: { readonly r: number; readonly bush: boolean } | null;
}

/** A waterline rock at the foot of the wall (island-local), kept apart so the caller can drop the ones under bridges and docks. */
export interface CliffToe {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly geometry: BufferGeometry;
}

const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;
const snap = (y: number, level: number) => Math.round((y - level) / 0.01) * 0.01 + level;

/**
 * The columns round a rim of `radius` from `base` up to `top`: widths fill the circle (less any `gap`) exactly, seeded by `random`;
 * columns reaching into one of the `cuts` are left out (further stairs).
 */
export function cliffColumns(
  radius: number, base: number, top: number, random: () => number, size: CliffSize = CLIFF, gap: CliffGap | null = null, cuts: readonly CliffGap[] = [],
): CliffColumn[] {
  const around = (2 * Math.PI - (gap ? 2 * gap.half : 0)) * radius;
  const widths: number[] = [];
  for (let sum = 0; sum < around; ) {
    const w = lerp(size.width, random());
    widths.push(w);
    sum += w;
  }
  const scale = around / widths.reduce((s, w) => s + w, 0);
  const columns: CliffColumn[] = [];
  let a = gap ? gap.at + gap.half : random() * 2 * Math.PI;
  for (const w of widths) {
    const a1 = a + (w * scale) / radius;
    const y1 = random() < size.notch ? snap(top - lerp(size.notchDrop, random()), size.level) : top;
    const upperH = y1 - snap(y1 - Math.min(lerp(size.upper, random()), (y1 - base) * size.upperShare), size.level);
    let out = lerp(size.upperOut, random());
    const face = () => ({ shade: random() * 2 - 1, bulge: lerp(size.bulge, random()), ridge: (random() - 0.5) * 0.8 });
    const slabs: CliffSlab[] = [{ y0: y1 - upperH, y1, out, upper: true, ...face() }];
    const lowTop = y1 - upperH;
    const strata = random() < size.split ? [lowTop, snap(lowTop - (lowTop - base) * (0.4 + random() * 0.25), size.level), base] : [lowTop, base];
    for (let k = 1; k < strata.length; k++) {
      out += lerp(size.step, random());
      slabs.push({ y0: strata[k]!, y1: strata[k - 1]!, out, upper: false, ...face() });
    }
    const moss = random() < size.moss ? { w: Math.min(w * scale * 0.8, lerp(size.mossWidth, random())), len: lerp(size.mossLength, random()) } : null;
    const toe = random() < size.toe ? { r: lerp(size.toeRadius, random()), bush: random() < size.bush } : null;
    const half = (a1 - a) / 2;
    const mid = a + half;
    if (!cuts.some((c) => Math.abs(Math.atan2(Math.sin(mid - c.at), Math.cos(mid - c.at))) < c.half + half)) columns.push({ a0: a, a1, slabs, moss, toe });
    a = a1;
  }
  return columns;
}

/**
 * The designed cliff round an island rim (island-local, centred on 0, 0): columns of chamfered stone blocks stepping out
 * towards the water in the bible's bands, grass tongues hanging from the lip, lavender rocks (some with a bush) at the toe.
 * Stone crisp, moss and bushes soft in outline (bible §5). The wall is one merged geometry; the toe rocks come apart.
 */
export function cliffWall(
  radius: number, base: number, top: number, waterY: number, p: LookPalette, random: () => number, size: CliffSize = CLIFF, gap: CliffGap | null = null,
  cuts: readonly CliffGap[] = [],
): { wall: BufferGeometry; toes: CliffToe[] } {
  const parts: BufferGeometry[] = [];
  const toes: CliffToe[] = [];
  for (const col of cliffColumns(radius, base, top, random, size, gap, cuts)) {
    const seam = size.seam / 2 / radius;
    const a0 = col.a0 + seam;
    const a1 = col.a1 - seam;
    for (const s of col.slabs) {
      const colour = new Color(s.upper ? p.cliffHigh : p.cliffLow).offsetHSL(0, 0, s.shade * 0.035);
      const g = slab(a0, a1, radius + s.out, s, size.depth, size.chamfer, colour.getHex());
      parts.push(surfaced(s.upper ? bakeAo(g, s.y0, 0.35, 0.2) : bakeAo(g, waterY - 0.2, 0.5, 0.25), Surface.rock));
    }
    const upper = col.slabs[0]!;
    if (col.moss) parts.push(surfaced(tongue(a0, a1, radius, radius + upper.out, upper, col.moss.w, col.moss.len, p.grassLight, random), Surface.plain));
    if (col.toe) {
      const mid = (a0 + a1) / 2;
      const lowest = col.slabs[col.slabs.length - 1]!;
      const d = radius + lowest.out + col.toe.r * 0.55;
      const x = Math.cos(mid) * d;
      const z = Math.sin(mid) * d;
      const r = col.toe.r;
      const rock = new IcosahedronGeometry(1, 0).scale(r, r * 0.65, r * 0.85).rotateY(random() * Math.PI * 2);
      const colour = new Color(p.rock).offsetHSL(0, 0, (random() - 0.5) * 0.06).getHex();
      const pieces = [surfaced(bakeAo(facet(rock, colour, x, waterY - 0.1, z), waterY - 0.3, 0.5, 0.35), Surface.rock)];
      if (col.toe.bush) {
        const b = r * 0.55;
        pieces.push(surfaced(facet(new IcosahedronGeometry(b, 0).scale(1, 0.8, 1), p.leaves[random() < 0.5 ? 0 : 1] ?? p.grass, x - Math.cos(mid) * r * 0.25, waterY - 0.1 + r * 0.6, z - Math.sin(mid) * r * 0.25), Surface.plain));
      }
      toes.push({ x, z, r, geometry: pieces.length > 1 ? merge(pieces) : pieces[0]! });
    }
  }
  return { wall: merge(parts), toes };
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return g;
}

/** Fan-triangulates a convex polygon into `pos`, wound so its normal faces `outward`. */
function face(pos: number[], pts: readonly Vector3[], outward: Vector3): void {
  const n = new Vector3().subVectors(pts[1]!, pts[0]!).cross(new Vector3().subVectors(pts[2]!, pts[0]!));
  const flip = n.dot(outward) < 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [b, c] = flip ? [pts[i + 1]!, pts[i]!] : [pts[i]!, pts[i + 1]!];
    pos.push(pts[0]!.x, pts[0]!.y, pts[0]!.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
}

/**
 * A stone block on the rim between rays a0 and a1, `dist` metres from the centre, `depth` deep, from the slab's y0 to y1: its
 * face is two facets meeting at a ridge that juts out (chunky cut stone), the top outer edge chamfered. Back and bottom open.
 */
function slab(a0: number, a1: number, dist: number, s: CliffSlab, depth: number, c: number, colour: number): BufferGeometry {
  const { y0, y1 } = s;
  const mid = (a0 + a1) / 2;
  const tan = Math.tan((a1 - a0) / 2);
  const u = new Vector3(Math.cos(mid), 0, Math.sin(mid));
  const t = new Vector3(-Math.sin(mid), 0, Math.cos(mid));
  const at = (d: number, side: number, y: number) => new Vector3(u.x * d + t.x * side * d * tan, y, u.z * d + t.z * side * d * tan);
  const ridge = (d: number, y: number) => new Vector3(u.x * (d + s.bulge) + t.x * s.ridge * dist * tan, y, u.z * (d + s.bulge) + t.z * s.ridge * dist * tan);
  const inner = dist - depth;
  const pos: number[] = [];
  const ch = Math.min(c, (y1 - y0) / 3);
  const yc = y1 - ch;
  const up = new Vector3(u.x, 1, u.z);
  for (const side of [-1, 1]) {
    const out = new Vector3(u.x + t.x * side * 0.5, 0, u.z + t.z * side * 0.5);
    face(pos, [at(dist, side, y0), ridge(dist, y0), ridge(dist, yc), at(dist, side, yc)], out);
    face(pos, [at(dist, side, yc), ridge(dist, yc), ridge(dist - ch, y1), at(dist - ch, side, y1)], up);
  }
  face(pos, [at(dist - ch, -1, y1), ridge(dist - ch, y1), at(dist - ch, 1, y1), at(inner, 1, y1), at(inner, -1, y1)], new Vector3(0, 1, 0));
  for (const side of [-1, 1]) {
    const out = t.clone().multiplyScalar(side);
    face(pos, [at(inner, side, y0), at(dist, side, y0), at(dist, side, yc), at(dist - ch, side, y1), at(inner, side, y1)], out);
  }
  return painted(pos, colour);
}

/** Tags every vertex with one atlas layer (`Surface.plain` = picked from colour and slope by the shader). */
function surfaced(g: BufferGeometry, surface: SurfaceId): BufferGeometry {
  g.setAttribute('surface', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(surface), 1));
  return g;
}

/**
 * A grass tongue hanging from the lip over a block's two-facet face (rays a0..a1, face `faceDist` from the centre): from under
 * the lip edge, over the block's top edge, down the face in uneven lobes, following the facets.
 */
function tongue(a0: number, a1: number, rim: number, faceDist: number, s: CliffSlab, w: number, len: number, colour: number, random: () => number): BufferGeometry {
  const a = (a0 + a1) / 2;
  const half = faceDist * Math.tan((a1 - a0) / 2);
  const ridge = s.ridge * half;
  const u = new Vector3(Math.cos(a), 0, Math.sin(a));
  const t = new Vector3(-Math.sin(a), 0, Math.cos(a));
  const at = (d: number, side: number, y: number) => new Vector3(u.x * d + t.x * side, y, u.z * d + t.z * side);
  // Depth of the face at tangent offset x: the facets rise from the column edges to the ridge.
  const depth = (x: number) => faceDist + s.bulge * (x <= ridge ? (x + half) / (ridge + half) : (half - x) / (half - ridge));
  const steps = 4;
  const lobes = 1 + Math.floor(random() * 2);
  const phase = random() * Math.PI;
  const shift = (random() - 0.5) * Math.max(0, 2 * half - w) * 0.8;
  const rows: Vector3[][] = [];
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const x = Math.max(-half, Math.min(half, shift + (f - 0.5) * w));
    const edge = Math.sin(f * Math.PI);
    const drop = len * (0.25 + 0.75 * edge * (0.6 + 0.4 * Math.abs(Math.sin(f * Math.PI * lobes + phase))));
    const front = depth(x) + 0.05;
    rows.push([at(rim + 0.05, x * 0.9, s.y1 + 0.06), at(front, x, s.y1 - 0.02), at(front + 0.02, x, s.y1 - 0.02 - drop)]);
  }
  const pos: number[] = [];
  for (let k = 0; k < steps; k++) {
    for (let r = 0; r < 2; r++) face(pos, [rows[k]![r]!, rows[k + 1]![r]!, rows[k + 1]![r + 1]!, rows[k]![r + 1]!], new Vector3(u.x, 0.5, u.z));
  }
  return bakeAo(painted(pos, colour), s.y1 - len, len, 0.25);
}

function painted(pos: number[], colour: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const c = new Color(colour);
  const n = pos.length / 3;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
