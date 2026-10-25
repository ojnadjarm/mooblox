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
