import { describe, expect, it } from 'vitest';
import { groundSpots, lawnTest } from '../../src/world/ground-scatter';

describe('groundSpots', () => {
  const all = () => true;

  it('is deterministic, capped, ring by ring outwards and within the radius', () => {
    const a = groundSpots(3, -4, 12, 50, all);
    expect(a).toEqual(groundSpots(3, -4, 12, 50, all));
    expect(a.length).toBe(50);
    const d = a.map((s) => Math.hypot(s.x - 3, s.z + 4));
    expect(Math.max(...d)).toBeLessThanOrEqual(12);
    expect(Math.max(...d.slice(0, 10))).toBeLessThan(Math.min(...d.slice(-10)) + 3.3);
  });

  it('keeps a cell spot in place as the window moves (no popping)', () => {
    const key = (s: { x: number; z: number }) => `${s.x.toFixed(4)},${s.z.toFixed(4)}`;
    const here = new Set(groundSpots(0, 0, 10, 1000, all).map(key));
    const moved = groundSpots(2, 1, 10, 1000, all).filter((s) => Math.hypot(s.x, s.z) < 7);
    expect(moved.length).toBeGreaterThan(20);
    for (const s of moved) expect(here.has(key(s))).toBe(true);
  });

  it('places only where the lawn test allows', () => {
    const lawn = lawnTest([{ x: 0, z: 0, radius: 20 }, { x: 90, z: 0, radius: 20 }], [{ x: 10, z: 0 }], [{ ax: -20, az: 5, bx: 20, bz: 5 }], { hits: (x, z) => Math.hypot(x + 8, z + 8) < 2 }, 4);
    lawn.focus(0, 0, 25);
    const spots = groundSpots(0, 0, 25, 1000, lawn.open);
    expect(spots.length).toBeGreaterThan(30);
    for (const s of spots) {
      expect(Math.hypot(s.x, s.z)).toBeLessThan(18.8);
      expect(Math.hypot(s.x, s.z)).toBeGreaterThan(4);
      expect(Math.hypot(s.x - 10, s.z)).toBeGreaterThan(2.6);
      expect(Math.abs(s.z - 5)).toBeGreaterThan(1.6);
    }
  });
});
