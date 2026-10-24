import { describe, expect, it } from 'vitest';
import { monumentGeometry } from '../../src/world/monument';

const site = { x: -4.8, z: -0.9, r: 1.4, face: 1.4 };
const tris = (g: { getAttribute(n: string): { count: number } }) => g.getAttribute('position').count / 3;

describe('class goal monument', () => {
  it('stays one small geometry inside its footprint; reaching the goal adds the sunburst', () => {
    const progress = monumentGeometry(site, 4, false);
    const reached = monumentGeometry(site, 10, true);
    expect(tris(progress)).toBeLessThan(1200);
    expect(tris(reached)).toBeGreaterThan(tris(progress));
    expect(tris(reached)).toBeLessThan(1400);
    progress.computeBoundingBox();
    const b = progress.boundingBox!;
    expect(Math.max(b.max.x - site.x, site.x - b.min.x, b.max.z - site.z, site.z - b.min.z)).toBeLessThanOrEqual(site.r + 0.01);
  });

  it('lights one lantern per tenth of the goal', () => {
    const gold = (g: ReturnType<typeof monumentGeometry>) => {
      const c = g.getAttribute('color');
      let n = 0;
      for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - 0.922) < 0.01 && Math.abs(c.getY(i) - 0.552) < 0.01) n++;
      return n;
    };
    expect(gold(monumentGeometry(site, 6, false))).toBeGreaterThan(gold(monumentGeometry(site, 2, false)));
  });
});
