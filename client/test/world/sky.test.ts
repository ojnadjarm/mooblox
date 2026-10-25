import { describe, expect, it } from 'vitest';
import { CLOUD_HIGH, CLOUD_RING, cloudPuffs, overviewPuffs } from '../../src/world/sky-data';

describe('cloud layer design', () => {
  it('is the same for the same seed', () => {
    expect(cloudPuffs(7)).toEqual(cloudPuffs(7));
    expect(cloudPuffs(7)).not.toEqual(cloudPuffs(8));
  });

  it('puts ring clouds in every eighth of the sky, just above an eye-level horizon', () => {
    const ring = cloudPuffs(7).slice(0, CLOUD_RING.count);
    const sectors = new Set(ring.map((c) => Math.floor(((Math.atan2(c.z, c.x) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4))));
    expect(sectors.size).toBe(8);
    for (const c of ring) {
      const elevation = (Math.atan2(c.y - 3, Math.hypot(c.x, c.z)) * 180) / Math.PI;
      expect(elevation).toBeGreaterThan(3);
      expect(elevation).toBeLessThan(16);
    }
  });

  it('builds each cloud as a cumulus of 4-7 billows on one flat base, biggest first', () => {
    const all = [...cloudPuffs(7), ...overviewPuffs(7)];
    expect(all).toHaveLength(CLOUD_RING.count + CLOUD_HIGH.count + 3);
    for (const c of all) {
      expect(c.lumps.length).toBeGreaterThanOrEqual(4);
      expect(c.lumps.length).toBeLessThanOrEqual(7);
      expect(Math.max(...c.lumps.map((l) => l.r))).toBe(c.lumps[0]!.r);
      expect(Math.min(...c.lumps.map((l) => l.dy - l.r * 0.8))).toBeLessThan(0);
      const width = Math.max(...c.lumps.map((l) => l.dx + l.r)) - Math.min(...c.lumps.map((l) => l.dx - l.r));
      const height = Math.max(...c.lumps.map((l) => l.dy + l.r * 0.8));
      expect(width / height).toBeGreaterThan(1.8);
      expect(width / height).toBeLessThan(3.6);
    }
  });

  it('puts the overview clouds over the sea beyond the islands, below the map camera', () => {
    for (const c of overviewPuffs(7)) {
      expect(Math.hypot(c.x, c.z)).toBeGreaterThan(1.2);
      expect(c.y).toBeLessThan(0.4);
      expect(c.z).toBeLessThan(0);
    }
  });
});
