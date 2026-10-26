import { describe, expect, it } from 'vitest';
import { Vector3, type BufferGeometry, type Mesh } from 'three';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import type { WorldData } from '../../src/domain/types';
import { designWorld } from '../../src/world/dressing';
import { IslandBuilder } from '../../src/world/island-builder';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { MaterialKit } from '../../src/world/material-kit';
import { sealedModel } from '../../src/world/model-seal';
import { bakeKit } from '../../tools/kit-bake';

/** Flat up-facing triangles closer than this (m) in height z-fight from mid range (24-bit depth, near 0.1 m). */
const GAP = 0.004;

interface Flat {
  readonly y: number;
  readonly pts: readonly (readonly [number, number])[];
  readonly part: number;
}

/** Flat up-facing triangles of a geometry (world space), tagged with `part`. */
function flats(g: BufferGeometry, part: number, out: Flat[]): void {
  const pos = g.getAttribute('position');
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
    const ys = v.map((i) => pos.getY(i));
    if (Math.max(...ys) - Math.min(...ys) > 1e-4) continue;
    const p = v.map((i) => [pos.getX(i), pos.getZ(i)] as const);
    const area = (p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1]) - (p[2]![0] - p[0]![0]) * (p[1]![1] - p[0]![1]);
    if (Math.abs(area) < 1e-6 || ys[0]! < -0.5) continue;
    // Up-facing: counter-clockwise seen from above is a negative xz cross product.
    if (area > 0) continue;
    out.push({ y: ys[0]!, pts: p, part });
  }
}

/** Area and centroid of the overlap of two triangles (Sutherland-Hodgman clip of a by b). */
function overlap(a: Flat, b: Flat): { area: number; x: number; z: number } {
  let poly = [...a.pts];
  const c = b.pts;
  const s = Math.sign((c[1]![0] - c[0]![0]) * (c[2]![1] - c[0]![1]) - (c[2]![0] - c[0]![0]) * (c[1]![1] - c[0]![1]));
  for (let e = 0; e < 3 && poly.length; e++) {
    const [ax, az] = c[e]!;
    const [bx, bz] = c[(e + 1) % 3]!;
    const side = (p: readonly [number, number]) => s * ((bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax));
    const next: (readonly [number, number])[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) next.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    poly = next;
  }
  let area = 0;
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0] / poly.length;
    z += p[1] / poly.length;
  }
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  return { area: Math.abs(area) / 2, x, z };
}

/** Whether (x, z) lies inside triangle f (either winding). */
function inside(f: Flat, x: number, z: number): boolean {
  const [a, b, c] = f.pts as [readonly [number, number], readonly [number, number], readonly [number, number]];
  const d = (p: readonly [number, number], q: readonly [number, number]) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s1 = d(a, b);
  const s2 = d(b, c);
  const s3 = d(c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/** Pairs of flat up faces from different parts that overlap (> 1 cm²) within GAP of each other's height and are not covered by a face up to 5 cm above. */
function fights(all: readonly Flat[]): { x: number; z: number; y: number; dy: number; area: number }[] {
  const cell = 2;
  const grid = new Map<string, number[]>();
  all.forEach((f, i) => {
    const xs = f.pts.map((p) => p[0]);
    const zs = f.pts.map((p) => p[1]);
    for (let gx = Math.floor(Math.min(...xs) / cell); gx <= Math.floor(Math.max(...xs) / cell); gx++) {
      for (let gz = Math.floor(Math.min(...zs) / cell); gz <= Math.floor(Math.max(...zs) / cell); gz++) {
        const k = `${gx},${gz}`;
        const list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
    }
  });
  const seen = new Set<string>();
  const out: { x: number; z: number; y: number; dy: number; area: number }[] = [];
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const fa = all[list[a]!]!;
        const fb = all[list[b]!]!;
        if (fa.part === fb.part || Math.abs(fa.y - fb.y) >= GAP) continue;
        const key = `${list[a]},${list[b]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { area, x, z } = overlap(fa, fb);
        if (area <= 1e-4) continue;
        const top = Math.max(fa.y, fb.y);
        const cell2 = grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? [];
        if (cell2.some((k) => all[k]!.y >= top + GAP * 0.9 && all[k]!.y <= top + 0.05 && inside(all[k]!, x, z))) continue;
        out.push({ x: +fa.pts[0]![0].toFixed(1), z: +fa.pts[0]![1].toFixed(1), y: +fa.y.toFixed(3), dy: +Math.abs(fa.y - fb.y).toFixed(4), area: +area.toFixed(4) });
      }
    }
  }
  return out;
}

function audit(world: WorldData): ReturnType<typeof fights> {
  const layout = new IslandLayout(CAMPUS.size).layout(world);
  const all: Flat[] = [];
  let part = 0;
  // Island builder meshes are merged from many parts: one part per connected flat patch is unknown, so each mesh's flats get
  // a part per triangle colour run; parts in one mesh at one height that overlap are separate pieces by construction.
  const group = new IslandBuilder(new MaterialKit('standard'), CAMPUS).build(world, layout);
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as Mesh;
    // The merged land and tops draw only in the overview, instead of the per-island parts: audit the parts.
    if (!m.isMesh || o.name === 'water' || (o.parent === group && (o.name === 'land' || o.name === 'tops'))) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const before = all.length;
    flats(g, 0, all);
    for (let i = before; i < all.length; i++) (all[i] as { part: number }).part = part++;
  });
  for (const d of designWorld(layout, world.courseId, CAMPUS.palette).districts) {
    for (const t of d.terrain) flats(t.geometry, part++, all);
  }
  return fights(all);
}

describe('coplanar ground', () => {
  // The ground layer (lawn decals, plaza paving and trim, walks, kerbs, patches): the big flat faces the camera skims.
  it.each(['demo', '3,0,5', '8x12'])('%s: no two ground faces overlap within 4 mm of height', (shape) => {
    const world = shape === 'demo' ? toWorld(fixture) : shapeWorld(300, parseShape(shape));
    const ground = audit(world).filter((f) => f.y < 0.5);
    expect(ground.slice(0, 5)).toEqual([]);
  });
});

/** Same-facing triangle pairs of a model placed at `scale` that overlap (> 1 cm² and 1 % of the smaller) within GAP of one plane. */
function propFights(g: BufferGeometry, scale: number): number {
  const gap = GAP / scale;
  const pos = g.getAttribute('position');
  const tris = [];
  for (let t = 0; t < pos.count / 3; t++) {
    const v = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, t * 3 + k));
    const n = new Vector3().subVectors(v[1]!, v[0]!).cross(new Vector3().subVectors(v[2]!, v[0]!));
    const area = n.length() / 2;
    if (area > 1e-12) tris.push({ v, n: n.normalize(), d: n.dot(v[0]!), area });
  }
  let count = 0;
  for (let a = 0; a < tris.length; a++) {
    for (let b = a + 1; b < tris.length; b++) {
      // Height of the smaller face's centre over the larger one's plane: where the two overlap.
      const [ta, tb] = tris[a]!.area >= tris[b]!.area ? [tris[a]!, tris[b]!] : [tris[b]!, tris[a]!];
      const cb = tb.v[0]!.clone().add(tb.v[1]!).add(tb.v[2]!).divideScalar(3);
      if (ta.n.dot(tb.n) < 0.999 || Math.abs(ta.n.dot(cb) - ta.d) >= gap) continue;
      const u = new Vector3(Math.abs(ta.n.x) > 0.9 ? 0 : 1, Math.abs(ta.n.x) > 0.9 ? 1 : 0, 0).cross(ta.n).normalize();
      const w = new Vector3().crossVectors(ta.n, u);
      const flat = (t: typeof ta): Flat => ({ y: 0, part: 0, pts: t.v.map((p) => [p.dot(u), p.dot(w)] as const) });
      const area = overlap(flat(ta), flat(tb)).area;
      if (area > 0.01 * Math.min(ta.area, tb.area) && area * scale * scale > 1e-4) count++;
    }
  }
  return count;
}

describe('coplanar props', () => {
  it('no two same-facing faces of a placed kit model share a plane (4 mm at the model\'s placed size)', async () => {
    const kit = await bakeKit(new URL('../../public/assets/kit.glb', import.meta.url).pathname);
    const used = new Map<string, { scale: number; backs: boolean }>();
    for (const world of [toWorld(fixture), shapeWorld(399, parseShape('8x12'))]) {
      for (const d of designWorld(new IslandLayout(CAMPUS.size).layout(world), world.courseId, CAMPUS.palette).districts) {
        for (const p of d.placements) {
          const m = kit.get(p.id)!.model;
          used.set(p.id, { scale: Math.max(used.get(p.id)?.scale ?? 0, p.width ? p.width / m.width : p.height / m.height), backs: p.sway !== true && !/building/.test(p.id) });
        }
      }
    }
    const bad: string[] = [];
    for (const [id, { scale, backs }] of used) {
      const n = propFights(sealedModel(kit.get(id)!.model, backs, scale), scale);
      if (n) bad.push(`${id} ${n}`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
