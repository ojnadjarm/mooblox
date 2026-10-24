import { describe, expect, it } from 'vitest';
import { frameArcs, planterRun, runFootprint } from '../../src/world/landmarks/plaza-frame';
import { CAMPUS } from '../../src/world/look';
import { seededRandom } from '../../src/world/random';

const TAU = Math.PI * 2;
const dist = (a: number, b: number) => Math.abs(((((a - b) % TAU) + TAU + Math.PI) % TAU) - Math.PI);

describe('plaza frame arcs', () => {
  it('keeps every entry open and cuts runs no longer than the run with gaps between', () => {
    const entries = [0.3, 2.1, 4.4];
    const arcs = frameArcs(entries, 0.3, 0.6, 0.2);
    expect(arcs.length).toBeGreaterThan(3);
    for (const arc of arcs) {
      expect(arc.a1 - arc.a0).toBeLessThanOrEqual(0.6 + 1e-9);
      for (const e of entries) for (let t = 0; t <= 1; t += 0.1) expect(dist(arc.a0 + t * (arc.a1 - arc.a0), e)).toBeGreaterThanOrEqual(0.3 - 1e-9);
    }
    const sorted = [...arcs].sort((x, y) => x.a0 - y.a0);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.a0 - sorted[i - 1]!.a1).toBeGreaterThanOrEqual(0.2 - 1e-9);
  });

  it('rings a plaza with no entries and drops slivers between close entries', () => {
    const full = frameArcs([], 0.3, 0.6, 0.2);
    const covered = full.reduce((s, a) => s + a.a1 - a.a0, 0);
    expect(covered).toBeCloseTo(TAU - full.length * 0.2, 6);
    expect(frameArcs([1, 1.7], 0.3, 0.6, 0.2).some((a) => a.a0 > 1 && a.a1 < 1.7)).toBe(false);
  });
});

describe('planter run', () => {
  const ring = { r0: 7.1, r1: 8.05, h: 0.42 };
  const arc = { a0: 0.2, a1: 0.8 };

  it('is one finite coloured mesh inside the ring, under 600 triangles', () => {
    const g = planterRun(arc, ring, CAMPUS.palette, seededRandom(3));
    const pos = g.getAttribute('position');
    expect(g.getAttribute('color').count).toBe(pos.count);
    expect(pos.count / 3).toBeLessThan(600);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(ring.r0 - 0.25);
      expect(r).toBeLessThan(ring.r1 + 0.25);
      expect(pos.getY(i)).toBeLessThan(1.4);
    }
  });

  it('claims footprints along the whole run', () => {
    const f = runFootprint(arc, ring);
    const mid = (ring.r0 + ring.r1) / 2;
    expect(Math.atan2(f[0]!.z, f[0]!.x)).toBeCloseTo(arc.a0, 6);
    expect(Math.atan2(f.at(-1)!.z, f.at(-1)!.x)).toBeCloseTo(arc.a1, 6);
    for (let i = 1; i < f.length; i++) expect(Math.hypot(f[i]!.x - f[i - 1]!.x, f[i]!.z - f[i - 1]!.z)).toBeLessThanOrEqual(f[i]!.r + 1e-9);
    for (const c of f) expect(Math.hypot(c.x, c.z)).toBeCloseTo(mid, 6);
    const apart = runFootprint(arc, ring, true);
    for (let i = 1; i < apart.length; i++) expect(Math.hypot(apart[i]!.x - apart[i - 1]!.x, apart[i]!.z - apart[i - 1]!.z)).toBeGreaterThanOrEqual(2 * apart[i]!.r);
  });
});
