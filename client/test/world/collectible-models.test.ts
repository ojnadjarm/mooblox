import { describe, expect, it } from 'vitest';
import { collectibleGeometry, collectibleTriangles } from '../../src/world/collectible-models';
import { COLLECTIBLE_TIERS } from '../../src/world/collectibles';

describe('collectible models', () => {
  it('are small designed meshes with vertex colours and flat normals', () => {
    for (const kind of ['gem', 'crystal', 'star'] as const) {
      const g = collectibleGeometry(kind);
      expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
      expect(g.getAttribute('normal')).toBeTruthy();
      g.computeBoundingBox();
      const size = g.boundingBox!.max.clone().sub(g.boundingBox!.min);
      expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.5);
      expect(Math.max(size.x, size.y, size.z)).toBeLessThan(1.2);
    }
  });

  it('keep the low tier inside 4k extra triangles with every gem shown', () => {
    const t = collectibleTriangles();
    expect(t.gem * COLLECTIBLE_TIERS.low.max).toBeLessThanOrEqual(4000);
    expect(t.gem * COLLECTIBLE_TIERS.medium.max).toBeLessThanOrEqual(8000);
    expect(t.crystal).toBeLessThanOrEqual(120);
    expect(t.star).toBeLessThanOrEqual(40);
  });
});
