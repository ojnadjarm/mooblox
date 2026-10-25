import { describe, expect, it } from 'vitest';
import { SHADOW_COUNT, cloudShadows, shadeAt } from '../../src/world/cloud-shadows';

const islands = [
  { x: 0, z: 0, radius: 22 },
  { x: 60, z: 10, radius: 20 },
  { x: -40, z: 50, radius: 18 },
];
const reach = Math.max(...islands.map((c) => Math.hypot(c.x, c.z) + c.radius));

describe('cloud shadows on the sea', () => {
  it('is the same for the same islands and seed', () => {
    expect(cloudShadows(islands)).toEqual(cloudShadows(islands));
    expect(cloudShadows(islands, 3)).not.toEqual(cloudShadows(islands, 4));
  });

  it('puts one shadow in every sector of a ring past the outer shores, longer along it than across', () => {
    const list = cloudShadows(islands);
    expect(list).toHaveLength(SHADOW_COUNT);
    const sectors = new Set(list.map((c) => Math.round((c.angle - list[0]!.angle) / ((Math.PI * 2) / SHADOW_COUNT))));
    expect(sectors.size).toBe(SHADOW_COUNT);
    for (const c of list) {
      expect(c.radius).toBeGreaterThanOrEqual(reach * 0.75);
      expect(c.radius).toBeLessThanOrEqual(reach * 1.25);
      expect(c.across).toBeLessThan(c.along * 0.66);
      expect(c.along).toBeGreaterThan(reach * 0.3);
    }
  });

  it('shades fully at a centre, not at all far out, and drifts with the turn', () => {
    const list = cloudShadows(islands);
    const c = list[0]!;
    const x = Math.cos(c.angle) * c.radius;
    const z = Math.sin(c.angle) * c.radius;
    expect(shadeAt(list, x, z)).toBe(1);
    expect(shadeAt(list, reach * 10, reach * 10)).toBe(0);
    expect(shadeAt(list, x, z, Math.PI / SHADOW_COUNT)).toBeLessThan(1);
  });
});
