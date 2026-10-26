import { Box3, BufferGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Raycaster, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import type { WorldData } from '../../src/domain/types';
import { BvhCollider } from '../../src/player/collider';
import { Physics, stepBody } from '../../src/player/controller';
import { designWorld, type Dressing, type Placement } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import type { WorldLayout } from '../../src/world/layout';
import { CAMPUS } from '../../src/world/look';
import { boxSamples, makeStair, STAIR, stairBoxes, stairFlight, stairSteps, type Stair } from '../../src/world/stair';
import { bakeKit } from '../../tools/kit-bake';

const kit = await bakeKit(new URL('../../public/assets/kit.glb', import.meta.url).pathname);
const policy = new IslandLayout(CAMPUS.size);
/** The demo fixture, the perf gate's shapes (course = name length x 97 + 11) and the shapes other world tests use. */
const WORLDS: readonly (readonly [string, () => WorldData])[] = [
  ['demo', () => toWorld(fixture)],
  ['1x2 perf', () => shapeWorld(302, parseShape('1x2'))],
  ['8x12 perf', () => shapeWorld(399, parseShape('8x12'))],
  ['20x30 perf', () => shapeWorld(496, parseShape('20x30'))],
  ['1x2', () => shapeWorld(11, parseShape('1x2'))],
  ['8x12', () => shapeWorld(812, parseShape('8x12'))],
  ['20x30', () => shapeWorld(2030, parseShape('20x30'))],
];
const REACH = 9;
/** Room the generator keeps between a landing and an activity plot's edge (the landing itself is STAIR.landing deep). */
const PLOT_CLEAR = 0.9;

/** A kit placement's geometry in world space. */
function placed(p: Placement): BufferGeometry {
  const m = kit.get(p.id)!.model;
  const k = p.width ? p.width / m.width : p.height / m.height;
  return m.geometry.clone().applyMatrix4(new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(k, k, k)));
}

/** Every solid the kid collides with within REACH of (x, z) (dressing terrain, solid kit models, blockers) on flat island ground. */
function colliderNear(d: Dressing, s: { x: number; z: number }): { c: BvhCollider; mesh: Mesh } {
  const area = new Box3(new Vector3(s.x - REACH, -1, s.z - REACH), new Vector3(s.x + REACH, 20, s.z + REACH));
  const parts: BufferGeometry[] = [new PlaneGeometry(2 * REACH + 4, 2 * REACH + 4).rotateX(-Math.PI / 2).translate(s.x, 0, s.z)];
  const keep = (g: BufferGeometry) => {
    g.computeBoundingBox();
    if (g.boundingBox!.intersectsBox(area)) parts.push(g);
  };
  for (const dist of [...d.districts, ...d.spans]) {
    for (const t of dist.terrain) if (t.solid) keep(t.geometry);
    for (const b of dist.blockers) keep(b);
    for (const p of dist.placements) if (p.solid && Math.abs(p.x - s.x) <= REACH + 6 && Math.abs(p.z - s.z) <= REACH + 6) keep(placed(p));
  }
  return bvh(parts);
}

/** One BVH collider (and raycast mesh) over `parts`. */
function bvh(parts: readonly BufferGeometry[]): { c: BvhCollider; mesh: Mesh } {
  const merged = mergeGeometries(parts.map((g) => {
    const p = new BufferGeometry();
    p.setAttribute('position', (g.index ? g.toNonIndexed() : g).getAttribute('position'));
    return p;
  }));
  const index: number[] = [];
  for (let i = 0; i < merged.getAttribute('position').count; i++) index.push(i);
  merged.setIndex(index);
  merged.boundsTree = new MeshBVH(merged);
  merged.computeBoundingBox();
  const mesh = new Mesh(merged, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.raycast = acceleratedRaycast;
  return { c: new BvhCollider(merged), mesh };
}

/** Ground height under (x, z): the first solid hit looking down from 6 m over the stair top. */
function groundAt(mesh: Mesh, s: Stair, x: number, z: number): number {
  const ray = new Raycaster(new Vector3(x, s.high + 6, z), new Vector3(0, -1, 0));
  ray.firstHitOnly = true;
  const hit = ray.intersectObject(mesh)[0];
  return hit ? hit.point.y : -Infinity;
}

/** Walks the kid from `from` towards `to` (world x, z) at walk speed for up to 6 s; returns where it ended. */
function walk(c: BvhCollider, from: { x: number; y: number; z: number }, to: { x: number; z: number }): Vector3 {
  const body = { position: new Vector3(from.x, from.y + 0.05, from.z), velocity: new Vector3(), onGround: false };
  for (let i = 0; i < 30; i++) stepBody(body, { x: 0, z: 0, run: false, jump: false }, Physics.step, c);
  for (let i = 0; i < 360; i++) {
    const dx = to.x - body.position.x;
    const dz = to.z - body.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) break;
    stepBody(body, { x: dx / len, z: dz / len, run: false, jump: false }, Physics.step, c);
  }
  for (let i = 0; i < 30; i++) stepBody(body, { x: 0, z: 0, run: false, jump: false }, Physics.step, c);
  return body.position;
}

interface Audit {
  readonly stairs: number;
  readonly wrongFacing: string[];
  readonly notWalkable: string[];
  readonly blockedLanding: string[];
}

function audit(layout: WorldLayout, d: Dressing): Audit {
  const wrongFacing: string[] = [];
  const notWalkable: string[] = [];
  const blockedLanding: string[] = [];
  const plots = layout.zones.flatMap((z) => z.plots);
  d.stairs.forEach((s, i) => {
    const { c, mesh } = colliderNear(d, s);
    const ux = Math.sin(s.face);
    const uz = Math.cos(s.face);
    const at = (d0: number) => ({ x: s.x + ux * d0, z: s.z + uz * d0 });
    const foot = at(s.run + 0.75);
    const head = at(-0.75);
    const id = `#${i} (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) ${s.low}->${s.high.toFixed(2)}`;
    const footY = groundAt(mesh, s, foot.x, foot.z);
    const headY = groundAt(mesh, s, head.x, head.z);
    if (Math.abs(footY - s.low) > 0.2 || Math.abs(headY - s.high) > 0.2) wrongFacing.push(`${id} foot ${footY.toFixed(2)} head ${headY.toFixed(2)}`);
    const below = at(s.run + STAIR.landing);
    const above = at(-STAIR.landing);
    const up = walk(c, { ...below, y: s.low }, above);
    const down = walk(c, { x: above.x, y: s.high, z: above.z }, below);
    const near = (p: Vector3, q: { x: number; z: number }, y: number) => Math.hypot(p.x - q.x, p.z - q.z) < 0.3 && Math.abs(p.y - y) < 0.15;
    if (!near(up, above, s.high) || !near(down, below, s.low)) {
      notWalkable.push(`${id} up (${up.x.toFixed(1)}, ${up.y.toFixed(2)}, ${up.z.toFixed(1)}) down (${down.x.toFixed(1)}, ${down.y.toFixed(2)}, ${down.z.toFixed(1)})`);
    }
    const boxes = stairBoxes(s);
    for (const [name, b] of [['low', boxes.low], ['high', boxes.high]] as const) {
      const hits = boxSamples(b, 0.3).filter((p) => {
        const push = c.resolve(new Vector3(p.x, b.y + 0.6, p.z), new Vector3(p.x, b.y + 2.4, p.z), 0.15);
        return push.lengthSq() > 1e-6;
      });
      const plot = plots.find((pl) => boxSamples(b, 0.3).some((q) => Math.hypot(q.x - pl.x, q.z - pl.z) < pl.radius + PLOT_CLEAR));
      if (hits.length || plot) blockedLanding.push(`${id} ${name}: ${hits.length} solid samples${plot ? `, activity ${plot.activityId}` : ''}`);
    }
  });
  return { stairs: d.stairs.length, wrongFacing, notWalkable, blockedLanding };
}

describe('stair flights', () => {
  it('climb from the low level to the high one with risers the kid walks up (<= 0.3 m)', () => {
    for (const h of [0.9, 1.2, 1.6, 1.8, 2.6]) {
      const n = stairSteps(h);
      expect(h / n).toBeLessThanOrEqual(STAIR.rise + 1e-9);
      const s = makeStair(0, 0, 0, 0, h, 2);
      expect(s.run).toBeCloseTo((n - 1) * STAIR.tread, 6);
      const g = stairFlight(s, { tread: 0xffffff, riser: 0x888888, side: 0x888888 });
      const pos = g.getAttribute('position');
      let topNear = -Infinity;
      let topFar = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getZ(i) < 0.2) topNear = Math.max(topNear, pos.getY(i));
        if (pos.getZ(i) > s.run - 0.2) topFar = Math.max(topFar, pos.getY(i));
      }
      expect(topNear).toBeGreaterThan(topFar);
      expect(topFar).toBeCloseTo(h / n, 5);
    }
  });

  it('has side faces that abut and never overlap (no coplanar z-fighting on the sides)', () => {
    const g = stairFlight(makeStair(3, -2, 0.7, 0, 1.6, 2.2), { tread: 0xffffff, riser: 0x888888, side: 0x888888 });
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const quads: { n: Vector3; box: Box3 }[] = [];
    for (let t = 0; t < pos.count; t += 6) {
      const box = new Box3();
      for (let k = 0; k < 6; k++) box.expandByPoint(new Vector3(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)));
      quads.push({ n: new Vector3(nor.getX(t), nor.getY(t), nor.getZ(t)), box });
    }
    let overlaps = 0;
    for (let a = 0; a < quads.length; a++) {
      for (let b = a + 1; b < quads.length; b++) {
        const qa = quads[a]!;
        const qb = quads[b]!;
        if (qa.n.dot(qb.n) < 0.999) continue;
        const i = qa.box.clone().intersect(qb.box);
        if (i.isEmpty()) continue;
        const size = i.getSize(new Vector3());
        const dims = [size.x, size.y, size.z].filter((v) => v > 1e-4).length;
        if (dims >= 2 && Math.abs(qa.n.y) > 0.5 === false && size.y > 1e-4 && Math.hypot(size.x, size.z) > 1e-3) overlaps++;
      }
    }
    expect(overlaps).toBe(0);
  });
});

describe('every stair of the generated worlds', () => {
  for (const [name, world] of WORLDS) {
    it(`${name}: faces its approach, the kid walks it up and down, landings clear`, () => {
      const w = world();
      const layout = policy.layout(w);
      const d = designWorld(layout, w.courseId, CAMPUS.palette);
      const a = audit(layout, d);
      expect(a.stairs).toBeGreaterThan(0);
      expect(a.wrongFacing).toEqual([]);
      expect(a.notWalkable).toEqual([]);
      expect(a.blockedLanding).toEqual([]);
    }, 120000);
  }
});

/** Depth (m) the kid capsule standing at `at` sinks into `c`. */
function sink(c: BvhCollider, at: Vector3): number {
  return c.resolve(new Vector3(at.x, at.y + Physics.radius, at.z), new Vector3(at.x, at.y + Physics.height - Physics.radius, at.z), Physics.radius).length();
}

describe('the kid never ends up inside a stair or a rock', () => {
  for (const [name, world] of WORLDS.slice(0, 3)) {
    it(`${name}: walking into every stair side and every rock over ankle height stops at its surface`, () => {
      const w = world();
      const d = designWorld(policy.layout(w), w.courseId, CAMPUS.palette);
      const inside: string[] = [];
      const rocks = d.districts.flatMap((x) => x.placements).filter((p) => p.id.startsWith('nature/rock_') && p.height > 0.3);
      expect(rocks.length).toBeGreaterThan(0);
      for (const p of rocks) {
        const body = bvh([placed(p)]);
        const r = body.mesh.geometry.boundingBox!;
        const reach = Math.max(r.max.x - r.min.x, r.max.z - r.min.z) / 2 + Physics.radius + 1.5;
        for (const a of [0, 2.1, 4.2]) {
          const from = { x: p.x + Math.sin(a) * reach, y: 0, z: p.z + Math.cos(a) * reach };
          const end = walk(colliderNear(d, p).c, from, { x: p.x, z: p.z });
          const depth = sink(body.c, end);
          if (depth > 0.1) inside.push(`${p.id} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) h${p.height.toFixed(2)} sinks ${depth.toFixed(2)}`);
        }
      }
      d.stairs.forEach((s, i) => {
        const body = bvh([stairFlight(s, { tread: 0, riser: 0, side: 0 })]);
        const ux = Math.sin(s.face);
        const uz = Math.cos(s.face);
        const mid = { x: s.x + ux * s.run * 0.4, z: s.z + uz * s.run * 0.4 };
        for (const side of [-1, 1]) {
          const from = { x: mid.x + uz * side * (s.width / 2 + 2), y: s.low, z: mid.z - ux * side * (s.width / 2 + 2) };
          const end = walk(colliderNear(d, s).c, from, mid);
          const depth = sink(body.c, end);
          if (depth > 0.1) inside.push(`stair #${i} (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) side ${side} sinks ${depth.toFixed(2)}`);
        }
      });
      expect(inside).toEqual([]);
    }, 240000);
  }
});
