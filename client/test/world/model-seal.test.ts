import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { sealModel } from '../../src/world/model-seal';
import { bakeKit } from '../../tools/kit-bake';

const kit = await bakeKit(new URL('../../public/assets/kit.glb', import.meta.url).pathname);

/** Faces of the edge-connected pieces that have a border edge (open sheets; a closed piece's backs face its inside). */
function openFaces(g: BufferGeometry): Set<number> {
  const pos = g.getAttribute('position');
  const key = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((x) => x.toFixed(4)).join(',');
  const n = pos.count / 3;
  const parent = Array.from({ length: n }, (_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  const edges = new Map<string, number[]>();
  for (let t = 0; t < n; t++) {
    for (let e = 0; e < 3; e++) {
      const id = [key(t * 3 + e), key(t * 3 + ((e + 1) % 3))].sort().join('|');
      const list = edges.get(id) ?? edges.set(id, []).get(id)!;
      if (list.length) parent[root(t)] = root(list[0]!);
      list.push(t);
    }
  }
  const open = new Set([...edges.values()].filter((l) => l.length === 1).map((l) => root(l[0]!)));
  return new Set(parent.map((_, t) => t).filter((t) => open.has(root(t))));
}

/** Rays from above ground around the model whose first hit is the back of an open sheet: the viewer sees through a hole. */
function holes(source: BufferGeometry): { back: number; hits: number } {
  const g = source.index ? source.toNonIndexed() : source;
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = box.getSize(new Vector3());
  const r = size.length();
  const pos = g.getAttribute('position');
  const probe = new BufferGeometry();
  probe.setAttribute('position', new BufferAttribute(Float32Array.from(pos.array), 3));
  const bvh = new MeshBVH(probe);
  // Faces with a reversed twin on the same corners (a ray grazing a sliver can report only one of the pair).
  const key = (t: number) => [0, 1, 2].map((k) => [pos.getX(t * 3 + k), pos.getY(t * 3 + k), pos.getZ(t * 3 + k)].map((x) => x.toFixed(4)).join(',')).sort().join('|');
  const corners = new Map<string, number>();
  const sheets = openFaces(g);
  for (let t = 0; t < pos.count / 3; t++) corners.set(key(t), (corners.get(key(t)) ?? 0) + 1);
  const ray = new Ray();
  const n = new Vector3();
  let back = 0;
  let hits = 0;
  for (let i = 0; i < 600; i++) {
    const y = (i / 600) * 0.97 + 0.02;
    const phi = i * 2.39996;
    const s = Math.sqrt(1 - y * y);
    const dir = new Vector3(Math.cos(phi) * s, y, Math.sin(phi) * s);
    for (let k = 0; k < 9; k++) {
      const aim = new Vector3(box.min.x + size.x * (0.2 + 0.3 * (k % 3)), box.min.y + size.y * (0.2 + 0.3 * Math.floor(k / 3)), box.min.z + size.z * (0.2 + 0.3 * ((k + i) % 3)));
      ray.origin.copy(aim).addScaledVector(dir, r * 2);
      ray.direction.copy(dir).negate();
      const all = bvh.raycast(ray, DoubleSide).sort((a, b) => a.distance - b.distance);
      if (!all.length) continue;
      hits++;
      const first = all.filter((h) => h.distance < all[0]!.distance + r * 1e-5);
      const own = (h: (typeof all)[number]) => Math.floor(probe.index!.getX(h.faceIndex! * 3) / 3);
      if (first.every((h) => n.copy(h.face!.normal).dot(ray.direction) > 0 && sheets.has(own(h)) && (corners.get(key(own(h))) ?? 0) < 2)) back++;
    }
  }
  return { back, hits };
}

describe('sealed kit models', () => {
  it('no placed prop shows a hole: under 1 % of rays from above ground (seams between pieces) meet an open sheet from behind first', () => {
    const props = new Set<string>();
    for (const world of [toWorld(fixture), shapeWorld(399, parseShape('8x12')), shapeWorld(496, parseShape('20x30'))]) {
      for (const d of designWorld(new IslandLayout(CAMPUS.size).layout(world), world.courseId, CAMPUS.palette).districts) {
        for (const p of d.placements) if (p.sway !== true && !/building/.test(p.id)) props.add(p.id);
      }
    }
    const bad: string[] = [];
    for (const id of props) {
      const { back, hits } = holes(sealModel(kit.get(id)!.model.geometry, true, 0));
      if (back > hits * 0.01) bad.push(`${id} ${back}/${hits}`);
    }
    expect(props.has('nature/tent_smallOpen')).toBe(true);
    expect(bad).toEqual([]);
  }, 120_000);

  it('the open tent (14.png) loses its holes', () => {
    const raw = holes(kit.get('nature/tent_smallOpen')!.model.geometry).back;
    const sealed = holes(sealModel(kit.get('nature/tent_smallOpen')!.model.geometry, true, 0)).back;
    expect(raw).toBeGreaterThan(100);
    expect(sealed).toBeLessThan(raw / 10);
  });

  it('the sign (16.png) keeps its planks off the board face', () => {
    const plain = kit.get('nature/sign')!.model.geometry.toNonIndexed();
    const sealed = sealModel(kit.get('nature/sign')!.model.geometry, true, 0.002);
    const pos = (g: BufferGeometry) => g.getAttribute('position').array as Float32Array;
    let moved = 0;
    for (let i = 0; i < pos(plain).length; i++) if (Math.abs(pos(plain)[i]! - pos(sealed)[i]!) > 1e-4) moved++;
    expect(moved).toBeGreaterThan(0);
  });
});
