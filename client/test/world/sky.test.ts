import { describe, expect, it } from 'vitest';
import { CLOUD_HIGH, CLOUD_RING, cloudPuffs } from '../../src/world/sky-data';

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

  it('builds each cloud from 3-5 lumps, biggest first', () => {
    const all = cloudPuffs(7);
    expect(all).toHaveLength(CLOUD_RING.count + CLOUD_HIGH.count);
    for (const c of all) {
      expect(c.lumps.length).toBeGreaterThanOrEqual(3);
      expect(c.lumps.length).toBeLessThanOrEqual(5);
      expect(Math.max(...c.lumps.map((l) => l.r))).toBe(c.lumps[0]!.r);
    }
  });
});
