import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3, type Mesh } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
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
import { logoSignParts, type LogoSignDesign } from '../../src/hub/logo-sign';
import { bakeKit } from '../../tools/kit-bake';

/** Same-facing faces closer than this (m) along their normal z-fight from mid range (24-bit depth, near 0.1 m). */
const GAP = 0.004;

interface Flat {
  readonly y: number;
  readonly pts: readonly (readonly [number, number])[];
  readonly part: number;
}

/** A world-space triangle of a terrain part: unit normal, plane offset, vertices, xz bounds. */
interface Face {
  readonly n: Vector3;
  readonly d: number;
  readonly v: readonly Vector3[];
  readonly part: number;
}

/** Sea level: faces wholly under it are hidden by the water. */
const WATER = -3;

/** Every non-degenerate triangle of a geometry a viewer can see (world space), tagged with `part`: none under water, no underside at or under the lawn (the island is opaque below it). */
function faces(g: BufferGeometry, part: number, out: Face[]): void {
  const pos = g.getAttribute('position');
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  for (let t = 0; t + 2 < n; t += 3) {
    const v = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k));
    const nn = new Vector3().subVectors(v[1]!, v[0]!).cross(new Vector3().subVectors(v[2]!, v[0]!));
    const top = Math.max(v[0]!.y, v[1]!.y, v[2]!.y);
    if (nn.length() < 2e-6 || top < WATER + 1e-3) continue;
    nn.normalize();
    if (nn.y < -0.5 && top <= 0.02) continue;
    out.push({ n: nn, d: nn.dot(v[0]!), v, part });
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

/** In-plane axes of a unit normal. */
function basis(n: Vector3): [Vector3, Vector3] {
  const u = new Vector3(Math.abs(n.x) > 0.9 ? 0 : 1, Math.abs(n.x) > 0.9 ? 1 : 0, 0).cross(n).normalize();
  return [u, new Vector3().crossVectors(n, u)];
}

/** Whether 2D point (x, z) lies inside triangle f (either winding). */
function inside(f: Flat, x: number, z: number): boolean {
  const [a, b, c] = f.pts as [readonly [number, number], readonly [number, number], readonly [number, number]];
  const d = (p: readonly [number, number], q: readonly [number, number]) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s1 = d(a, b);
  const s2 = d(b, c);
  const s3 = d(c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

interface Fight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly dy: number;
  readonly area: number;
  readonly parts: readonly [number, number];
}

/**
 * Pairs of same-facing faces from different parts, any orientation, that overlap (> 1 cm²) within GAP of each other's plane and
 * are seen from open air: not covered by a third same-facing face up to 5 cm in front of both, nor inside a solid.
 */
function fights(all: readonly Face[]): Fight[] {
  const bvh = solids(all);
  const cell = 2;
  const grid = new Map<string, number[]>();
  all.forEach((f, i) => {
    const xs = f.v.map((p) => p.x);
    const zs = f.v.map((p) => p.z);
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
  const out: Fight[] = [];
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) {
      const fa = all[list[a]!]!;
      for (let b = a + 1; b < list.length; b++) {
        const fb = all[list[b]!]!;
        if (fa.part === fb.part || fa.n.dot(fb.n) < 0.999) continue;
        if (fb.v.some((p) => Math.abs(fa.n.dot(p) - fa.d) >= GAP)) continue;
        const key = `${list[a]},${list[b]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [u, w] = basis(fa.n);
        const flat = (f: Face): Flat => ({ y: 0, part: f.part, pts: f.v.map((p) => [p.dot(u), p.dot(w)] as const) });
        const { area, x, z } = overlap(flat(fa), flat(fb));
        if (area <= 1e-4) continue;
        const front = Math.max(fa.d, fb.d);
        const hidden = list.some((k) => {
          const f = all[k]!;
          if (f.part === fa.part || f.part === fb.part || f.n.dot(fa.n) < 0.999) return false;
          const ahead = f.d - front;
          return ahead >= GAP * 0.9 && ahead <= 0.05 && inside(flat(f), x, z);
        });
        const c = u.clone().multiplyScalar(x).addScaledVector(w, z).addScaledVector(fa.n, fa.d);
        if (hidden || inSolid(bvh, c, fa.n)) continue;
        out.push({ x: +c.x.toFixed(1), y: +c.y.toFixed(3), z: +c.z.toFixed(1), dy: +Math.abs(fb.d - fa.d).toFixed(4), area: +area.toFixed(4), parts: [fa.part, fb.part] });
      }
    }
  }
  return out;
}

/** One BVH over every face, to tell open air from the inside of a solid. */
function solids(all: readonly Face[]): MeshBVH {
  const pos = new Float32Array(all.length * 9);
  all.forEach((f, i) => f.v.forEach((p, k) => pos.set([p.x, p.y, p.z], i * 9 + k * 3)));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  return new MeshBVH(g);
}

/** Whether a point 1 cm in front of a face at `c` (normal `n`) lies inside a solid: the first face a ray along `n` meets shows its back. */
function inSolid(bvh: MeshBVH, c: Vector3, n: Vector3): boolean {
  const ray = new Ray(c.clone().addScaledVector(n, 0.01), n);
  const hit = bvh.raycastFirst(ray, DoubleSide);
  return hit !== null && hit.face!.normal.dot(n) > 0;
}

/** Every terrain surface of a course: island land, rims, beaches, decals, pads, plaza; district terrain; bridge spans. */
function audit(world: WorldData): Fight[] {
  const layout = new IslandLayout(CAMPUS.size).layout(world);
  const all: Face[] = [];
  let part = 0;
  // Island builder meshes are merged from many parts; each triangle is its own part (pieces of one surface never overlap).
  const group = new IslandBuilder(new MaterialKit('standard'), CAMPUS).build(world, layout);
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as Mesh;
    // The merged land and tops draw only in the overview, instead of the per-island parts: audit the parts.
    if (!m.isMesh || o.name === 'water' || o.name === 'clouds' || (o.parent === group && (o.name === 'land' || o.name === 'tops'))) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const before = all.length;
    faces(g, 0, all);
    for (let i = before; i < all.length; i++) (all[i] as { part: number }).part = part++;
  });
  const dressing = designWorld(layout, world.courseId, CAMPUS.palette);
  for (const d of [...dressing.districts, ...dressing.spans]) {
    for (const t of d.terrain) faces(t.geometry, part++, all);
  }
  return fights(all);
}

describe('coplanar surfaces', () => {
  // Every terrain surface the camera sees: lawn, decals, paving, walks, kerbs, terraces, stairs and landings, cliffs, beaches, bridges.
  it.each(['demo', '3,0,5', '8x12'])('%s: no two same-facing terrain faces overlap within 4 mm of one plane', (shape) => {
    const world = shape === 'demo' ? toWorld(fixture) : shapeWorld(300, parseShape(shape));
    const all = audit(world);
    expect(all.slice(0, 5)).toEqual([]);
  }, 120_000);
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

describe('coplanar hub logo sign', () => {
  it.each<LogoSignDesign>(['gateway', 'board'])('%s: no two of its solid pieces share a plane where they overlap', (design) => {
    const all: Face[] = [];
    logoSignParts(CAMPUS.palette, design).forEach((g, part) => faces(g, part, all));
    expect(fights(all)).toEqual([]);
  });
});
