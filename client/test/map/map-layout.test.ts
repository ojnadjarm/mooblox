import { describe, expect, it } from 'vitest';
import { islandAt, MAP, mapLayout, neighbour } from '../../src/map/map-layout';

describe('mapLayout', () => {
  for (const n of [0, 1, 3, 12, 40]) {
    it(`lays ${n} islands without overlap, clear of the home island`, () => {
      const l = mapLayout(n);
      expect(l.islands).toHaveLength(n);
      const all = [l.home, ...l.islands];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i]!;
          const b = all[j]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius + MAP.gap - 1e-6);
        }
      }
      for (const c of all) expect(Math.hypot(c.x, c.z) + c.radius).toBeLessThanOrEqual(l.extent + 1e-6);
    });
  }

  it('is the same for the same count and keeps earlier islands in place', () => {
    expect(mapLayout(12)).toEqual(mapLayout(12));
    expect(mapLayout(40).islands.slice(0, 5)).toEqual(mapLayout(5).islands);
  });

  it('keeps 40 courses within 160 m', () => {
    expect(mapLayout(40).extent).toBeLessThan(160);
  });
});

describe('islandAt', () => {
  it('finds the island under a point and none in open water', () => {
    const l = mapLayout(3);
    const c = l.islands[2]!;
    expect(islandAt(l.islands, c.x + 3, c.z - 2)).toBe(2);
    expect(islandAt(l.islands, 0, 0)).toBe(-1);
  });
});

describe('neighbour', () => {
  it('moves towards the arrow and wraps when nothing lies that way', () => {
    const islands = [
      { x: 0, z: 0, radius: 1 },
      { x: 10, z: 0, radius: 1 },
      { x: 0, z: 10, radius: 1 },
    ];
    expect(neighbour(islands, 0, 1, 0)).toBe(1);
    expect(neighbour(islands, 0, 0, 1)).toBe(2);
    expect(neighbour(islands, 1, 1, 0)).toBe(2);
    expect(neighbour([], 0, 1, 0)).toBe(-1);
  });
});
