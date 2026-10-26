import { beforeAll, describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Quaternion, Ray, Vector3, type Mesh } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { attached, designWorld, type Dressing, type Placement } from '../../src/world/dressing';
import { IslandBuilder } from '../../src/world/island-builder';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { MaterialKit } from '../../src/world/material-kit';
import { bakeKit, type KitModel } from '../../tools/kit-bake';
import { returnPortalGeometry } from '../../src/boot/return-portal';

/** Kit pieces laid as walkable ground (decks, bridges): they carry props rather than stand on ground. */
const DECK = /dock|platform|bridge|plank/;
/** Gap (m) under a prop's foot that reads as floating. */
const AIR = 0.08;

let kit: Map<string, KitModel>;
beforeAll(async () => {
  kit = await bakeKit(new URL('../../public/assets/kit.glb', import.meta.url).pathname);
});

function place(p: Placement): Matrix4 {
  const m = kit.get(p.id)!.model;
  const s = p.width ? p.width / m.width : p.height / m.height;
  return new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(s, s, s));
}

function design(shape: string): { d: Dressing; ground: (skip: (g: BufferGeometry) => boolean) => MeshBVH } {
  const world = shape === 'demo' ? toWorld(fixture) : shapeWorld(399, parseShape(shape));
  const layout = new IslandLayout(CAMPUS.size).layout(world);
  const d = designWorld(layout, world.courseId, CAMPUS.palette);
  const island: BufferGeometry[] = [];
  const group = new IslandBuilder(new MaterialKit('standard'), CAMPUS).build(world, layout);
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || o.name === 'water' || o.name === 'clouds' || (o.parent === group && (o.name === 'land' || o.name === 'tops'))) return;
    island.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
  });
  const all = [...d.districts, ...d.spans];
  const decks = all.flatMap((dd) => dd.placements.filter((p) => DECK.test(p.id)).map((p) => kit.get(p.id)!.model.geometry.clone().applyMatrix4(place(p))));
  const ground = (skip: (g: BufferGeometry) => boolean): MeshBVH => {
    const pos: number[] = [];
    for (const g of [...island, ...decks, ...all.flatMap((dd) => dd.terrain.map((t) => t.geometry)).filter((g) => !skip(g))]) {
      pos.push(...((g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array));
    }
    const gb = new BufferGeometry();
    gb.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    return new MeshBVH(gb);
  };
  return { d, ground };
}

/** Whether ground lies within AIR under (x, y, z). */
function grounded(bvh: MeshBVH, x: number, y: number, z: number): boolean {
  const hit = bvh.raycastFirst(new Ray(new Vector3(x, y + 0.3, z), new Vector3(0, -1, 0)), DoubleSide);
  return hit !== null && hit.point.y >= y - AIR;
}

/** Props with a foot point off the ground, flags off the ground, and landmarks whose base ring overhangs. */
function floating(shape: string): string[] {
  const { d, ground } = design(shape);
  const bad: string[] = [];
  const bvh = ground(() => false);
  for (const dd of d.districts) {
    for (const p of dd.placements) {
      if (p.y < -1 || DECK.test(p.id)) continue;
      const g = kit.get(p.id)!.model.geometry;
      g.computeBoundingBox();
      const { min, max } = g.boundingBox!;
      const m = place(p);
      const pos = g.getAttribute('position');
      const v = new Vector3();
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > min.y + (max.y - min.y) * 0.03) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (!grounded(bvh, v.x, v.y, v.z)) {
          bad.push(`${p.id} @${p.x.toFixed(1)},${p.z.toFixed(1)}`);
          break;
        }
      }
    }
  }
  for (const l of d.life) if (l.kind === 'flag' && l.y > -1 && !grounded(bvh, l.x, l.y, l.z)) bad.push(`flag @${l.x.toFixed(1)},${l.z.toFixed(1)}`);
  const own = (g: BufferGeometry): boolean => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    const inside = (l: (typeof d.landmarks)[number], r: number) => [b.min.x, b.max.x].every((x) => [b.min.z, b.max.z].every((z) => Math.hypot(x - l.x, z - l.z) < r));
    return d.landmarks.some((l) => inside(l, l.reach + 0.02) || (b.min.y > l.y + 0.29 && inside(l, 3 * l.reach)));
  };
  const under = ground(own);
  for (const l of d.landmarks) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      if (!grounded(under, l.x + Math.cos(a) * l.reach * 0.97, l.y, l.z + Math.sin(a) * l.reach * 0.97)) {
        bad.push(`landmark ${l.theme} @${l.x.toFixed(1)},${l.z.toFixed(1)}`);
        break;
      }
    }
  }
  return bad;
}

/** Pairs of placed props whose meshes cut into each other, designed attachments (`attached`) and swaying plants aside. */
function overlaps(shape: string): string[] {
  const { d } = design(shape);
  const bvhs = new Map<string, MeshBVH>();
  const bvh = (id: string): MeshBVH => bvhs.get(id) ?? bvhs.set(id, new MeshBVH(kit.get(id)!.model.geometry)).get(id)!;
  const bad: string[] = [];
  for (const dd of [...d.districts, ...d.spans]) {
    const ps = dd.placements.filter((p) => !p.sway).map((p) => {
      const g = kit.get(p.id)!.model.geometry;
      g.computeBoundingBox();
      const m = place(p);
      const box = g.boundingBox!.clone().applyMatrix4(m);
      return { p, m, box };
    });
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i]!;
        const b = ps[j]!;
        if (!a.box.intersectsBox(b.box) || attached(a.p.id, b.p.id)) continue;
        if (bvh(a.p.id).intersectsGeometry(kit.get(b.p.id)!.model.geometry, a.m.clone().invert().multiply(b.m))) bad.push(`${a.p.id} + ${b.p.id} @${a.p.x.toFixed(1)},${a.p.z.toFixed(1)}`);
      }
    }
  }
  return bad;
}

/** The return portal on the spawn hub: its frame on ground under every foot, cutting into no prop and no solid terrain part. */
function portalClashes(shape: string): string[] {
  const { d, ground } = design(shape);
  const site = d.portal;
  if (!site) return ['no return portal site'];
  const frame = returnPortalGeometry();
  const m = new Matrix4().compose(new Vector3(site.x, 0, site.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), site.face), new Vector3(1, 1, 1));
  const world = frame.clone().applyMatrix4(m);
  world.computeBoundingBox();
  const box = world.boundingBox!;
  const bad: string[] = [];
  const bvh = ground(() => false);
  const pos = world.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y > box.min.y + 0.01) continue;
    if (!grounded(bvh, v.x, v.y, v.z)) {
      bad.push(`portal foot off the ground @${v.x.toFixed(1)},${v.z.toFixed(1)}`);
      break;
    }
  }
  const mine = new MeshBVH(world);
  for (const dd of d.districts) {
    for (const p of dd.placements) {
      if (p.sway) continue;
      const g = kit.get(p.id)!.model.geometry;
      g.computeBoundingBox();
      const pm = place(p);
      if (!g.boundingBox!.clone().applyMatrix4(pm).intersectsBox(box)) continue;
      if (mine.intersectsGeometry(g, pm)) bad.push(`portal + ${p.id} @${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    for (const t of dd.terrain) {
      if (!t.solid) continue;
      t.geometry.computeBoundingBox();
      if (!t.geometry.boundingBox!.intersectsBox(box)) continue;
      if (mine.intersectsGeometry(t.geometry, new Matrix4())) bad.push('portal + terrain');
    }
  }
  return bad;
}

describe('placement', () => {
  it.each(['demo', '3,0,5', '8x12'])('%s: the return portal stands on ground and clear of every prop', (shape) => {
    expect(portalClashes(shape)).toEqual([]);
  }, 120_000);

  it.each(['demo', '3,0,5', '8x12'])('%s: every prop, flag and landmark stands on ground under its whole foot', (shape) => {
    expect(floating(shape)).toEqual([]);
  }, 120_000);

  it.each(['demo', '3,0,5', '8x12'])('%s: no two props cut into each other', (shape) => {
    expect(overlaps(shape)).toEqual([]);
  }, 120_000);
});
