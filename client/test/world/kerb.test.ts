import { BoxGeometry, CylinderGeometry, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import type { WorldData } from '../../src/domain/types';
import { designWorld, type KerbPiece, type Segment } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { dropUndersides, KERB, kerbArc, kerbRun, kerbTris, ringBand } from '../../src/world/landmarks/kerb';
import { CAMPUS } from '../../src/world/look';

const tris = (g: BufferGeometry) => g.getAttribute('position').count / 3;

function normals(g: BufferGeometry): { n: Vector3; c: Vector3 }[] {
  const p = g.getAttribute('position');
  const out: { n: Vector3; c: Vector3 }[] = [];
  for (let t = 0; t < p.count; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(p, t + k)) as [Vector3, Vector3, Vector3];
    out.push({ n: b.clone().sub(a).cross(c.clone().sub(a)).normalize(), c: a.clone().add(b).add(c).divideScalar(3) });
  }
  return out;
}

describe('kerb runs', () => {
  it('cost ten triangles a block plus two end caps, no underside', () => {
    for (const len of [0.6, 2.4, 7.3, 18]) {
      const g = kerbRun(len, 0xf4e6cc, 7);
      const blocks = Math.max(1, Math.round(len / KERB.block));
      expect(tris(g)).toBe(kerbTris(blocks));
      expect(normals(g).every(({ n }) => n.y > -0.5)).toBe(true);
    }
  });

  it('turns every face outwards and stays in its box', () => {
    const len = 5;
    const g = kerbRun(len, 0xf4e6cc, 3);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0);
    expect(g.boundingBox!.max.y).toBeCloseTo(KERB.h);
    expect(g.boundingBox!.max.x).toBeCloseTo(KERB.w / 2);
    expect(g.boundingBox!.max.z).toBeCloseTo(len / 2);
    for (const { n, c } of normals(g)) {
      const axis = new Vector3(0, KERB.h / 2, Math.min(len / 2 - 0.1, Math.max(-len / 2 + 0.1, c.z)));
      expect(n.dot(c.clone().sub(axis))).toBeGreaterThan(0);
    }
  });

  it('shades neighbouring blocks apart so the joints read', () => {
    const g = kerbRun(4.4, 0xf4e6cc, 11);
    const col = g.getAttribute('color');
    const top = (b: number) => col.getX(b * 30 + 12);
    for (let b = 0; b < 3; b++) expect(Math.abs(top(b) - top(b + 1))).toBeGreaterThan(0.02);
  });
});

describe('dropUndersides', () => {
  it('drops only the faces turned straight down', () => {
    expect(tris(dropUndersides(new BoxGeometry(2, 0.06, 3)))).toBe(10);
    expect(tris(dropUndersides(new CylinderGeometry(1.1, 1.1, 0.06, 10)))).toBe(30);
    expect(normals(dropUndersides(new BoxGeometry(2, 0.06, 3))).every(({ n }) => n.y > -0.5)).toBe(true);
  });
});

describe('kerb arcs and ring bands', () => {
  it('close a ring with no caps, every face outwards, tops up', () => {
    const g = kerbArc(8, 0, 2 * Math.PI, 0xf4e6cc, 5);
    const n = normals(g);
    expect(n.every(({ n }) => n.y > -0.5)).toBe(true);
    for (const { n: nn, c } of n) {
      const a = Math.atan2(c.z, c.x);
      const axis = new Vector3(8 * Math.cos(a), KERB.h / 2, 8 * Math.sin(a));
      expect(nn.dot(c.clone().sub(axis))).toBeGreaterThan(0);
    }
    expect(tris(g) % 10).toBe(0);
    expect(tris(kerbArc(8, 0, 1, 0xf4e6cc, 5)) % 10).toBe(8);
  });

  it('turn under 3 degrees a piece on the smallest ring', () => {
    const g = kerbArc(7 - 1.22, 0, 2 * Math.PI, 0xf4e6cc, 5);
    const pieces = tris(g) / 10;
    expect((2 * Math.PI) / pieces).toBeLessThan((3 * Math.PI) / 180);
  });

  it('lay a band with its top up and its walls out', () => {
    const g = ringBand(6, 8, 0.06);
    for (const { n, c } of normals(g)) {
      const r = Math.hypot(c.x, c.z);
      if (n.y > 0.5) continue;
      expect(n.dot(new Vector3(c.x, 0, c.z).normalize()) * (r > 7 ? 1 : -1)).toBeGreaterThan(0.99);
    }
  });
});

/** The demo fixture and the perf gate's shapes. */
const WORLDS: readonly (readonly [string, () => WorldData])[] = [
  ['demo', () => toWorld(fixture)],
  ['1x2 perf', () => shapeWorld(302, parseShape('1x2'))],
  ['8x12 perf', () => shapeWorld(399, parseShape('8x12'))],
  ['20x30 perf', () => shapeWorld(496, parseShape('20x30'))],
];
const OFF = 1.1 + KERB.w / 2 - 0.08;

/** Points along a kerb's centre line every `step` metres, `inset` short of its ends. */
function samples(k: KerbPiece, step: number, inset: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  if (k.kind === 'run') {
    for (let t = -k.len / 2 + inset; t <= k.len / 2 - inset; t += step) out.push({ x: k.x + Math.sin(k.yaw) * t, z: k.z + Math.cos(k.yaw) * t });
  } else {
    const da = inset / k.r;
    for (let a = k.a0 + da; a <= k.a1 - da; a += step / k.r) out.push({ x: k.x + Math.cos(a) * k.r, z: k.z + Math.sin(a) * k.r });
  }
  return out;
}

/** Whether (x, z) lies on kerb `k` (its footprint shrunk by `pad`). */
function onKerb(k: KerbPiece, x: number, z: number, pad: number): boolean {
  const half = KERB.w / 2 - pad;
  if (k.kind === 'run') {
    const along = (x - k.x) * Math.sin(k.yaw) + (z - k.z) * Math.cos(k.yaw);
    const across = (x - k.x) * Math.cos(k.yaw) - (z - k.z) * Math.sin(k.yaw);
    return Math.abs(along) <= k.len / 2 - pad && Math.abs(across) <= half;
  }
  const a = Math.atan2(z - k.z, x - k.x);
  const turn = (((a - k.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.abs(Math.hypot(x - k.x, z - k.z) - k.r) <= half && turn >= pad / k.r && turn <= k.a1 - k.a0 - pad / k.r;
}

const axisDistance = (s: Segment, x: number, z: number) => {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
};

describe('kerbs in the world', () => {
  it.each(WORLDS)('%s: rings close but for walk openings, no kerb overlaps another or crosses a walk', (_name, world) => {
    const w = world();
    const d = designWorld(new IslandLayout(CAMPUS.size).layout(w), w.courseId, CAMPUS.palette);
    const arcs = d.kerbs.filter((k) => k.kind === 'arc');
    const rings = arcs.filter((k, i) => arcs.findIndex((o) => o.x === k.x && o.z === k.z && Math.abs(o.r - k.r) < 2 * OFF + 0.01) === i);
    const circles = rings.map((k) => ({ x: k.x, z: k.z, r: k.r + OFF }));
    expect(arcs.length).toBe(rings.length * 2);
    const chord = (s: Segment) => circles.some((c) => Math.abs(Math.hypot(s.ax - c.x, s.az - c.z) - c.r) < 0.01 && Math.abs(Math.hypot(s.bx - c.x, s.bz - c.z) - c.r) < 0.01);
    const walks = d.paths.filter((s) => !chord(s));
    let overlaps = 0;
    let crossings = 0;
    for (const k of d.kerbs) {
      for (const p of samples(k, 0.25, 0.1)) {
        if (d.kerbs.some((o) => o !== k && onKerb(o, p.x, p.z, 0.02))) overlaps++;
        if (walks.some((s) => axisDistance(s, p.x, p.z) < 0.95) || circles.some((c) => Math.abs(Math.hypot(p.x - c.x, p.z - c.z) - c.r) < 0.95)) crossings++;
      }
    }
    let gaps = 0;
    for (const k of arcs) {
      if (k.kind !== 'arc') continue;
      // The opening faces a walk, and each kerb end meets that walk's kerb.
      const mid = (k.a1 + k.a0) / 2 + Math.PI;
      if (!walks.some((s) => axisDistance(s, k.x + Math.cos(mid) * k.r, k.z + Math.sin(mid) * k.r) < 0.5)) gaps++;
      for (const a of [k.a0, k.a1]) {
        const x = k.x + Math.cos(a) * k.r;
        const z = k.z + Math.sin(a) * k.r;
        const near = d.kerbs.some((o) => o.kind === 'run' && samples(o, 0.05, 0).some((p) => Math.hypot(p.x - x, p.z - z) < KERB.w / 2 + 0.3));
        if (!near) gaps++;
      }
    }
    expect({ overlaps, crossings, gaps }).toEqual({ overlaps: 0, crossings: 0, gaps: 0 });
  }, 60_000);
});
