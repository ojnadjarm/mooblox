import { BufferAttribute, BufferGeometry, Color } from 'three';
import { seededRandom } from '../random';
import { bakeAo } from './shapes';

/** Kerb block size (metres): width, height, top chamfer and target block length. */
export const KERB = { w: 0.4, h: 0.26, chamfer: 0.08, block: 1.1 } as const;

/** Triangles of a kerb run of `blocks` blocks: five long faces per block and a hexagonal cap at each end; no underside. */
export const kerbTris = (blocks: number): number => blocks * 10 + 8;

/**
 * A run of chunky cut-stone kerb blocks `len` long on z (centred at 0, standing on y = 0), as the play and district concepts
 * edge every walk: chamfered long top edges, blocks butted end to end, each a different shade of the stone so the joints read
 * from the colour alone (no end faces between them), a baked foot shade.
 */
export function kerbRun(len: number, colour: number, seed: number): BufferGeometry {
  const { w, h, chamfer: c, block } = KERB;
  const n = Math.max(1, Math.round(len / block));
  const p: [number, number][] = [[-w / 2, 0], [-w / 2, h - c], [-w / 2 + c, h], [w / 2 - c, h], [w / 2, h - c], [w / 2, 0]];
  const pos: number[] = [];
  const col: number[] = [];
  const base = new Color(colour);
  const tone = new Color();
  const random = seededRandom(seed);
  const v = (i: number, z: number) => pos.push(p[i]![0], p[i]![1], z);
  const paint = (verts: number) => {
    for (let i = 0; i < verts; i++) col.push(tone.r, tone.g, tone.b);
  };
  for (let b = 0; b < n; b++) {
    const z0 = -len / 2 + (b * len) / n;
    const z1 = -len / 2 + ((b + 1) * len) / n;
    const k = (b % 2 ? 0.9 : 1.03) + (random() - 0.5) * 0.06;
    tone.setRGB(base.r * k, base.g * k, base.b * (k - 0.02 + random() * 0.04));
    for (let i = 0; i < p.length - 1; i++) {
      v(i, z0), v(i + 1, z1), v(i + 1, z0);
      v(i, z0), v(i, z1), v(i + 1, z1);
    }
    paint(30);
    if (b === 0) {
      for (let i = 1; i < p.length - 1; i++) v(0, z0), v(i, z0), v(i + 1, z0);
      paint(12);
    }
    if (b === n - 1) {
      for (let i = 1; i < p.length - 1; i++) v(0, z1), v(i + 1, z1), v(i, z1);
      paint(12);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return bakeAo(g, 0, h, 0.3);
}

/** Longest straight piece of a curved kerb (metres): turns stay under 3 degrees on the smallest plot ring. */
const ARC_STEP = 0.3;

/**
 * Kerb blocks as `kerbRun` swept round a circle of radius `r` about the origin from angle `a0` to `a1` (x = r cos a, z = r sin a,
 * a1 > a0): a smooth curve with no joints to gape or overlap, a cap at each end unless the arc closes the ring.
 */
export function kerbArc(r: number, a0: number, a1: number, colour: number, seed: number): BufferGeometry {
  const { w, h, chamfer: c, block } = KERB;
  const closed = a1 - a0 >= 2 * Math.PI - 1e-9;
  const n = Math.max(1, Math.round((r * (a1 - a0)) / block));
  const sub = Math.max(1, Math.ceil((r * (a1 - a0)) / n / ARC_STEP));
  const p: [number, number][] = [[-w / 2, 0], [-w / 2, h - c], [-w / 2 + c, h], [w / 2 - c, h], [w / 2, h - c], [w / 2, 0]];
  const pos: number[] = [];
  const col: number[] = [];
  const base = new Color(colour);
  const tone = new Color();
  const random = seededRandom(seed);
  const v = (i: number, a: number) => pos.push((r + p[i]![0]) * Math.cos(a), p[i]![1], (r + p[i]![0]) * Math.sin(a));
  const paint = (verts: number) => {
    for (let i = 0; i < verts; i++) col.push(tone.r, tone.g, tone.b);
  };
  for (let b = 0; b < n; b++) {
    const k = (b % 2 || (closed && b === n - 1 && n % 2) ? 0.9 : 1.03) + (random() - 0.5) * 0.06;
    tone.setRGB(base.r * k, base.g * k, base.b * (k - 0.02 + random() * 0.04));
    for (let j = 0; j < sub; j++) {
      const s0 = a0 + ((a1 - a0) * (b * sub + j)) / (n * sub);
      const s1 = a0 + ((a1 - a0) * (b * sub + j + 1)) / (n * sub);
      for (let i = 0; i < p.length - 1; i++) {
        v(i, s0), v(i + 1, s1), v(i + 1, s0);
        v(i, s0), v(i, s1), v(i + 1, s1);
      }
      paint(30);
    }
  }
  if (!closed) {
    tone.copy(base);
    for (let i = 1; i < p.length - 1; i++) v(0, a0), v(i, a0), v(i + 1, a0);
    for (let i = 1; i < p.length - 1; i++) v(0, a1), v(i + 1, a1), v(i, a1);
    paint(24);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return bakeAo(g, 0, h, 0.3);
}

/** A flat ring band from radius `r0` to `r1` about the origin, `h` thick on y = 0: top and both side walls, flat normals. */
export function ringBand(r0: number, r1: number, h: number): BufferGeometry {
  const n = Math.max(48, Math.ceil((2 * Math.PI * r1) / ARC_STEP));
  const pos: number[] = [];
  const nor: number[] = [];
  const at = (r: number, i: number, y: number) => [r * Math.cos((i / n) * 2 * Math.PI), y, r * Math.sin((i / n) * 2 * Math.PI)] as const;
  const quad = (q: readonly (readonly [number, number, number])[], normal: (k: number) => readonly [number, number, number]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...q[k]!), nor.push(...normal(k));
  };
  const out = (i: number, s: number) => [s * Math.cos((i / n) * 2 * Math.PI), 0, s * Math.sin((i / n) * 2 * Math.PI)] as const;
  for (let i = 0; i < n; i++) {
    const j = i + 1;
    quad([at(r0, i, h), at(r0, j, h), at(r1, j, h), at(r1, i, h)], () => [0, 1, 0]);
    quad([at(r1, i, 0), at(r1, i, h), at(r1, j, h), at(r1, j, 0)], (k) => out(k === 0 || k === 1 ? i : j, 1));
    quad([at(r0, j, 0), at(r0, j, h), at(r0, i, h), at(r0, i, 0)], (k) => out(k === 0 || k === 1 ? j : i, -1));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  return g;
}

/** `g` without its faces turned straight down (the hidden undersides of walks laid on the lawn). */
export function dropUndersides(g: BufferGeometry): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  const pos = flat.getAttribute('position');
  const keep: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    const ax = pos.getX(t + 1) - pos.getX(t), az = pos.getZ(t + 1) - pos.getZ(t);
    const bx = pos.getX(t + 2) - pos.getX(t), bz = pos.getZ(t + 2) - pos.getZ(t);
    const ny = az * bx - ax * bz;
    const flatY = pos.getY(t) === pos.getY(t + 1) && pos.getY(t) === pos.getY(t + 2);
    if (!(flatY && ny < 0)) keep.push(t);
  }
  const out = new BufferGeometry();
  for (const [name, a] of Object.entries(flat.attributes)) {
    const s = a.itemSize;
    const arr = new Float32Array(keep.length * 3 * s);
    keep.forEach((t, i) => arr.set((a.array as Float32Array).subarray(t * s, (t + 3) * s), i * 3 * s));
    out.setAttribute(name, new BufferAttribute(arr, s));
  }
  return out;
}
