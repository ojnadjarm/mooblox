import { describe, expect, it } from 'vitest';
import { hop, routeAt, strollRoute, walkerRoute } from '../../src/world/npc-schedule';

describe('walkerRoute', () => {
  const pose = () => ({ x: 0, z: 0, heading: 0, walking: false, sight: -1 });

  it('walks a bare path there and back, standing at each end', () => {
    const r = walkerRoute(0, 0, 0, 10, [], [], 2, 3);
    expect(r.cycle).toBeCloseTo(16, 6);
    const p = routeAt(r, 2.5, pose());
    expect(p.walking).toBe(true);
    expect(p.z).toBeCloseTo(5, 6);
    expect(p.heading).toBeCloseTo(0, 6);
    expect(routeAt(r, 6, pose())).toMatchObject({ walking: false, z: 10, sight: -1 });
    const back = routeAt(r, 10.5, pose());
    expect(back.z).toBeCloseTo(5, 6);
    expect(back.heading).toBeCloseTo(Math.PI, 6);
    expect(routeAt(r, 16 + 2.5, pose()).z).toBeCloseTo(5, 6);
  });

  it('visits a stall near an end, standing off its rim and looking at it, then walks back to the path', () => {
    const stall = { x: 3, z: 10, r: 1.3, up: 0 };
    const r = walkerRoute(0, 0, 0, 10, [stall], [{ x: 3, z: 10, r: 1.3 }], 2, 2);
    expect(r.x.length).toBe(4);
    const k = Array.from(r.sight).indexOf(0);
    expect(Math.hypot(r.x[k]! - 3, r.z[k]! - 10)).toBeCloseTo(2, 6);
    expect(r.dwell[k]).toBeCloseTo(3.2, 6);
    const at = routeAt(r, r.at[k]! + 1, pose());
    expect(at).toMatchObject({ walking: false, sight: 0 });
    const out = r.at[k]! + r.dwell[k]! + 0.25;
    expect(routeAt(r, out, pose())).toMatchObject({ walking: true, sight: -1 });
  });

  it('leaves the path beside a stall halfway along, and visits a second sight on the way back', () => {
    const sights = [
      { x: 8, z: 5, r: 1.3, up: 0 },
      { x: -9, z: 2, r: 0.4, up: 0 },
    ];
    const r = walkerRoute(0, 0, 0, 10, sights, [], 2, 2);
    expect(Array.from(r.sight)).toEqual([-1, 0, -1, -1, 1, -1]);
    expect(r.x[0]).toBeCloseTo(0, 6);
    expect(r.z[0]).toBeCloseTo(5, 6);
    expect(Math.hypot(r.x[1]! - 8, r.z[1]! - 5)).toBeCloseTo(2, 6);
    expect(r.z[3]).toBeCloseTo(2, 6);
    expect(Math.hypot(r.x[4]! + 9, r.z[4]! - 2)).toBeCloseTo(1.1, 6);
    expect(r.x[5]).toBe(0);
    expect(r.z[5]).toBe(0);
  });

  it('bends once round an obstacle between the path and the sight', () => {
    const r = walkerRoute(0, 0, 0, 10, [{ x: 8, z: 5, r: 1.3, up: 0 }], [{ x: 8, z: 5, r: 1.3 }, { x: 4, z: 5, r: 0.5 }], 2, 2);
    expect(Array.from(r.sight)).toEqual([-1, -1, 0, -1, -1]);
    expect(r.x[1]).toBeCloseTo(4, 6);
    expect(Math.abs(r.z[1]! - 5)).toBeCloseTo(1.2, 6);
    expect(r.dwell[1]).toBe(0);
  });

  it('skips a sight out of reach or behind another obstacle', () => {
    expect(walkerRoute(0, 0, 0, 10, [{ x: 16, z: 10, r: 1.3, up: 0 }], [], 2, 2).x.length).toBe(2);
    const blocked = walkerRoute(0, 0, 0, 10, [{ x: 4, z: 10, r: 1, up: 0 }], [{ x: 1.6, z: 10, r: 0.5 }], 2, 2);
    expect(blocked.x.length).toBe(2);
  });

  it('allocates nothing per call', () => {
    const r = walkerRoute(0, 0, 0, 10, [{ x: 3, z: 10, r: 1.3, up: 0 }], [], 2, 2);
    const p = pose();
    for (let t = 0; t < 40; t += 0.1) expect(routeAt(r, t, p)).toBe(p);
  });
});

describe('strollRoute', () => {
  it('loops two sights, bending round an obstacle between them, standing off each rim facing the way it came', () => {
    const sights = [
      { x: 0, z: 0, r: 2.9, up: 0 },
      { x: 0, z: 14, r: 1.3, up: 0 },
    ];
    const r = strollRoute(0, sights, [{ x: 0, z: 0, r: 2.45 }, { x: 0, z: 14, r: 1.3 }, { x: 0, z: 7, r: 0.7 }], 2, 2)!;
    expect(Array.from(r.sight)).toEqual([-1, 0, -1, 1]);
    expect(r.z[1]).toBeCloseTo(3.6, 6);
    expect(r.z[3]).toBeCloseTo(12, 6);
    expect(Math.abs(r.x[0]!)).toBeCloseTo(1.4, 6);
    expect(strollRoute(0, sights, [{ x: 0, z: 7, r: 30 }], 2, 2)).toBeNull();
  });
});

describe('hop', () => {
  it('a short arc peaking at 0.9 m, then on the ground until the next period', () => {
    expect(hop(0, 4)).toBe(0);
    expect(hop(0.225, 4)).toBeCloseTo(0.9, 6);
    expect(hop(1, 4)).toBe(0);
    expect(hop(4.225, 4)).toBeCloseTo(0.9, 6);
  });
});
