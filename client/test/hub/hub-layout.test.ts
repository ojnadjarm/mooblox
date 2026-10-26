import { describe, expect, it } from 'vitest';
import { archSpots, displaySpots, floorCount, floorCourses, HUB, onLift, padOf, padSpots, PADS_PER_FLOOR, portalAt, spawnSpot } from '../../src/hub/hub-layout';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('hub layout', () => {
  it('splits courses into floors of five, Crash style', () => {
    expect([0, 1, 3, 5, 6, 12, 40].map(floorCount)).toEqual([1, 1, 1, 1, 2, 3, 8]);
    const list = Array.from({ length: 12 }, (_, i) => i);
    expect(floorCourses(list, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(floorCourses(list, 2)).toEqual([10, 11]);
    expect(padOf(11)).toEqual({ floor: 2, pad: 1 });
  });

  it('keeps pads, arches, displays, the lift and the hall apart and inside the balustrade', () => {
    const pads = padSpots();
    expect(pads).toHaveLength(PADS_PER_FLOOR);
    for (let i = 1; i < pads.length; i++) expect(dist(pads[i]!, pads[i - 1]!)).toBeGreaterThan(HUB.padRadius * 2 + 3);
    for (const p of pads) expect(dist(p, HUB.lift)).toBeGreaterThan(HUB.padRadius + HUB.lift.r + 8);
    for (const a of archSpots()) expect(dist(a, { x: 0, z: 0 }) + 2.8).toBeLessThan(HUB.wall);
    for (const d of displaySpots()) {
      expect(dist(d, HUB.hall)).toBeGreaterThan(HUB.hall.r + 2);
      for (const p of pads) expect(dist(d, p)).toBeGreaterThan(5);
    }
    expect(dist(HUB.hall, { x: 0, z: 0 }) + HUB.hall.r).toBeLessThan(HUB.wall);
  });

  it('faces every pad towards the centre', () => {
    for (const p of padSpots()) {
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      expect(fx * -p.x + fz * -p.z).toBeCloseTo(Math.hypot(p.x, p.z), 5);
    }
  });

  it('spawns on the lift, or off the pad of the course the kid came back from', () => {
    expect(onLift(spawnSpot(null).x, spawnSpot(null).z)).toBe(true);
    padSpots().forEach((p, i) => {
      const s = spawnSpot(i);
      expect(portalAt(s.x, 0.3, s.z)).toBe(-1);
      expect(dist(s, p)).toBeLessThan(HUB.padRadius + 2);
      expect(portalAt(p.x, 0.3, p.z)).toBe(-1);
    });
  });

  it('warps only once the kid touches a portal fluid, from its front', () => {
    archSpots().forEach((a, i) => {
      const at = (forward: number, side = 0) => {
        const fx = Math.sin(a.yaw);
        const fz = Math.cos(a.yaw);
        return portalAt(a.x + fx * forward + fz * side, 0.35, a.z + fz * forward - fx * side);
      };
      expect(at(1.5)).toBe(-1);
      expect(at(0.5)).toBe(i);
      expect(at(0.5, 1.2)).toBe(i);
      expect(at(0.5, 2.05)).toBe(-1);
      expect(at(-2)).toBe(-1);
    });
  });
});
