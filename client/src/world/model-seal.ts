import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { BakedModel } from './model-library';

/** Height step (metres at the placed size) between faces that would share a plane: past the 4 mm that z-fights from mid range. */
const LIFT = 0.006;
/** How far apart (share of the model's size) the plane constants of two faces within the coplanar normal tolerance can be. */
const TILT = 0.05;
/** Shortest ray (share of the model's size) that counts as an escape from a face's back. */
const NUDGE = 1e-4;

interface Tri {
  readonly n: Vector3;
  readonly d: number;
  readonly area: number;
  readonly v: readonly Vector3[];
  /** Centre. */
  readonly c: Vector3;
}

/**
 * A kit model as the world shows it with front-face culling: same-facing faces sharing a plane (they z-fight) lifted `step`
 * apart, the smaller over the larger, and, when `backs`, a reversed twin for every face whose back a viewer above ground can see.
 */
export function sealModel(source: BufferGeometry, backs: boolean, step: number): BufferGeometry {
  const plain = source.index ? source.toNonIndexed() : source.clone();
  plain.computeBoundingBox();
  const size = plain.boundingBox!.getSize(new Vector3()).length();
  const first = triangles(plain);
  const groups = byNormal(first);
  const g = backs ? withTwins(plain, exposedBacks(plain, size).filter((t) => !backed(first, groups, t, step))) : plain;
  const pos = g.getAttribute('position') as BufferAttribute;
  const tris = g === plain ? first : triangles(g);
  const lifted = step > 0 ? liftCoplanar(tris, byNormal(tris), step, size) : [];
  for (let t = 0; t < tris.length; t++) {
    if (!lifted[t]) continue;
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      pos.setXYZ(i, pos.getX(i) + tris[t]!.n.x * lifted[t]!, pos.getY(i) + tris[t]!.n.y * lifted[t]!, pos.getZ(i) + tris[t]!.n.z * lifted[t]!);
    }
  }
  return g;
}

const cache = new WeakMap<BakedModel, Map<string, BufferGeometry>>();

/** The sealed geometry a placement draws: back twins for props, none for swaying foliage cards and houses' closed shells. */
export function sealedPlacement(p: { readonly id: string; readonly sway?: boolean; readonly width?: number; readonly height: number }, m: BakedModel): BufferGeometry {
  return sealedModel(m, p.sway !== true && !/building/.test(p.id), p.width ? p.width / m.width : p.height / m.height);
}

/** `sealModel` of a baked model placed at `scale`, cached per model, `backs` and scale band (a quarter octave). */
export function sealedModel(m: BakedModel, backs: boolean, scale: number): BufferGeometry {
  const band = Math.ceil(Math.log2(scale) * 4);
  const key = `${backs}${band}`;
  const own = cache.get(m) ?? cache.set(m, new Map()).get(m)!;
  return own.get(key) ?? own.set(key, sealModel(m.geometry, backs, LIFT / 2 ** (band / 4))).get(key)!;
}

/** Plane, area and corners of every triangle of a non-indexed geometry. */
function triangles(g: BufferGeometry): Tri[] {
  const pos = g.getAttribute('position');
  const out: Tri[] = [];
  for (let t = 0; t < pos.count / 3; t++) {
    const v = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, t * 3 + k));
    const n = new Vector3().subVectors(v[1]!, v[0]!).cross(new Vector3().subVectors(v[2]!, v[0]!));
    const area = n.length() / 2;
    n.normalize();
    out.push({ n, d: n.dot(v[0]!), area, v, c: v[0]!.clone().add(v[1]!).add(v[2]!).divideScalar(3) });
  }
  return out;
}

/** Keys of the quantised-normal cells within 0.05 of normal `n` (times `sign`), so near-equal normals always share one. */
function normalKeys(n: Vector3, sign = 1): string[] {
  const span = (c: number) => [...new Set([Math.round(sign * c * 10 - 0.25), Math.round(sign * c * 10 + 0.25)])];
  return span(n.x).flatMap((x) => span(n.y).flatMap((y) => span(n.z).map((z) => `${x},${y},${z}`)));
}

/** Triangle indices grouped by quantised normal (a triangle can sit in several groups). */
function byNormal(tris: readonly Tri[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  tris.forEach((t, i) => {
    if (t.area < 1e-12) return;
    for (const k of normalKeys(t.n)) {
      const list = out.get(k);
      if (list) list.push(i);
      else out.set(k, [i]);
    }
  });
  return out;
}

/** Corners of `t` in plane coordinates of normal `n`. */
function flat(t: Tri, n: Vector3): (readonly [number, number])[] {
  const u = new Vector3(Math.abs(n.x) > 0.9 ? 0 : 1, Math.abs(n.x) > 0.9 ? 1 : 0, 0).cross(n).normalize();
  const w = new Vector3().crossVectors(n, u);
  return t.v.map((p) => [p.dot(u), p.dot(w)] as const);
}

/** How far to lift each triangle along its normal so no two same-facing overlapping triangles lie within `step` of one plane (smaller ones on top). */
function liftCoplanar(tris: readonly Tri[], buckets: Map<string, number[]>, step: number, size: number): number[] {
  const near = new Map<number, Set<number>>();
  for (const list of buckets.values()) {
    list.sort((a, b) => tris[a]!.d - tris[b]!.d);
    for (let a = 0; a < list.length; a++) {
      const ta = tris[list[a]!]!;
      for (let b = a + 1; b < list.length && tris[list[b]!]!.d - ta.d < 4 * step + TILT * size; b++) {
        const tb = tris[list[b]!]!;
        if (ta.n.dot(tb.n) < 0.998 || Math.abs(offset(tb, ta)) >= 4 * step || overlapArea(flat(ta, ta.n), flat(tb, ta.n)) < 1e-3 * Math.min(ta.area, tb.area)) continue;
        for (const [x, y] of [[list[a]!, list[b]!], [list[b]!, list[a]!]] as const) {
          const set = near.get(x);
          if (set) set.add(y);
          else near.set(x, new Set([y]));
        }
      }
    }
  }
  const lift = tris.map(() => 0);
  const placed = new Set<number>();
  const order = [...near.keys()].sort((a, b) => tris[b]!.area - tris[a]!.area || a - b);
  for (const t of order) {
    let d = 0;
    for (;;) {
      const clash = [...near.get(t)!].filter((c) => placed.has(c) && Math.abs(-offset(tris[t]!, tris[c]!) + lift[c]! - d) < step * 0.99);
      if (!clash.length) break;
      d = Math.max(...clash.map((c) => -offset(tris[t]!, tris[c]!) + lift[c]!)) + step;
    }
    lift[t] = d;
    placed.add(t);
  }
  return lift;
}

/** Height of triangle `c`'s centre over triangle `t`'s plane. */
function offset(c: Tri, t: Tri): number {
  return t.n.dot(c.c) - t.d;
}

/** Whether an opposite-facing triangle on the same plane already covers triangle `t`'s back. */
function backed(tris: readonly Tri[], buckets: Map<string, number[]>, t: number, step: number): boolean {
  const a = tris[t]!;
  const pts = flat(a, a.n);
  let covered = 0;
  for (const i of new Set(normalKeys(a.n, -1).flatMap((k) => buckets.get(k) ?? []))) {
    const b = tris[i]!;
    if (a.n.dot(b.n) > -0.999 || Math.abs(a.d + b.d) >= Math.max(step, 1e-6)) continue;
    covered += overlapArea(pts, flat(b, a.n));
  }
  return covered >= 0.9 * a.area;
}

/** Area of the overlap of two plane triangles (Sutherland-Hodgman clip of `a` by `c`). */
function overlapArea(a: readonly (readonly [number, number])[], c: readonly (readonly [number, number])[]): number {
  const s = Math.sign((c[1]![0] - c[0]![0]) * (c[2]![1] - c[0]![1]) - (c[2]![0] - c[0]![0]) * (c[1]![1] - c[0]![1]));
  let poly = [...a];
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
      if (sp > 0) next.push(p);
      if (sp > 0 !== sq > 0) next.push([p[0] + ((q[0] - p[0]) * sp) / (sp - sq), p[1] + ((q[1] - p[1]) * sp) / (sp - sq)]);
    }
    poly = next;
  }
  let area = 0;
  for (let i = 0; i < poly.length; i++) area += poly[i]![0] * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * poly[i]![1];
  return Math.abs(area) / 2;
}

/** Open-piece triangles whose back a ray from their centre reaches open air (the model's base plane blocks rays going under it). */
function exposedBacks(g: BufferGeometry, size: number): number[] {
  const pos = g.getAttribute('position');
  const box = g.boundingBox!;
  const base = new Float32Array(pos.count * 3 + 18);
  base.set(pos.array as Float32Array);
  const r = size * 4;
  const [cx, cz, y] = [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, box.min.y];
  base.set([cx - r, y, cz - r, cx - r, y, cz + r, cx + r, y, cz + r, cx - r, y, cz - r, cx + r, y, cz + r, cx + r, y, cz - r], pos.count * 3);
  const probe = new BufferGeometry();
  probe.setAttribute('position', new BufferAttribute(base, 3));
  const bvh = new MeshBVH(probe);
  const v = [new Vector3(), new Vector3(), new Vector3()];
  const n = new Vector3();
  const c = new Vector3();
  const ray = new Ray();
  const out: number[] = [];
  const dirs: Vector3[] = [];
  for (const t of openTriangles(g, size)) {
    v.forEach((p, k) => p.fromBufferAttribute(pos, t * 3 + k));
    n.subVectors(v[1]!, v[0]!).cross(new Vector3().subVectors(v[2]!, v[0]!));
    if (n.lengthSq() < 1e-16) continue;
    n.normalize().negate();
    const u = new Vector3(Math.abs(n.x) > 0.9 ? 0 : 1, Math.abs(n.x) > 0.9 ? 1 : 0, 0).cross(n).normalize();
    const w = new Vector3().crossVectors(n, u);
    dirs.length = 0;
    dirs.push(n.clone());
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) dirs.push(n.clone().addScaledVector(u, a * 1.2).addScaledVector(w, b * 1.2).normalize());
    c.copy(v[0]!).add(v[1]!).add(v[2]!).divideScalar(3);
    const exposed = dirs.some((dir) => {
      ray.origin.copy(c).addScaledVector(n, NUDGE * size);
      ray.direction.copy(dir);
      return bvh.raycastFirst(ray, DoubleSide) === null;
    });
    if (exposed) out.push(t);
  }
  return out;
}

/** Triangles of the edge-connected pieces with a border edge (a closed piece's backs face its inside). */
function openTriangles(g: BufferGeometry, size: number): number[] {
  const pos = g.getAttribute('position');
  const q = 1e-5 * size;
  const key = (i: number) => `${Math.round(pos.getX(i) / q)},${Math.round(pos.getY(i) / q)},${Math.round(pos.getZ(i) / q)}`;
  const n = pos.count / 3;
  const parent = Array.from({ length: n }, (_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  const edges = new Map<string, number[]>();
  for (let t = 0; t < n; t++) {
    const k = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    for (let e = 0; e < 3; e++) {
      const id = k[e]! < k[(e + 1) % 3]! ? `${k[e]}|${k[(e + 1) % 3]}` : `${k[(e + 1) % 3]}|${k[e]}`;
      const list = edges.get(id);
      if (list) {
        parent[root(t)] = root(list[0]!);
        list.push(t);
      } else edges.set(id, [t]);
    }
  }
  const open = new Set<number>();
  for (const list of edges.values()) if (list.length === 1) open.add(root(list[0]!));
  const out: number[] = [];
  for (let t = 0; t < n; t++) if (open.has(root(t))) out.push(t);
  return out;
}

/** The geometry plus a reversed copy (normals negated) of each listed triangle, appended in order (`userData.twins`). */
function withTwins(g: BufferGeometry, twins: readonly number[]): BufferGeometry {
  g.userData.twins = twins;
  if (!twins.length) return g;
  const out = new BufferGeometry();
  out.userData.twins = twins;
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as BufferAttribute;
    const size = a.itemSize;
    const data = new (a.array.constructor as Float32ArrayConstructor)((a.count + twins.length * 3) * size);
    data.set(a.array as Float32Array);
    let o = a.count;
    for (const t of twins) {
      for (const k of [0, 2, 1]) {
        for (let j = 0; j < size; j++) data[o * size + j] = a.getComponent(t * 3 + k, j) * (name === 'normal' ? -1 : 1);
        o++;
      }
    }
    out.setAttribute(name, new BufferAttribute(data, size, a.normalized));
  }
  return out;
}
