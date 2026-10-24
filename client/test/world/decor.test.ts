import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { toWorld } from '../../src/domain/mapper';
import { scatterDecor } from '../../src/world/decor';
import { IslandLayout } from '../../src/world/island-layout';

const world = toWorld(fixture);
const layout = new IslandLayout().layout(world);

describe('scatterDecor', () => {
  it('is deterministic per seed', () => {
    expect(scatterDecor(layout, 30)).toEqual(scatterDecor(layout, 30));
    expect(scatterDecor(layout, 30)).not.toEqual(scatterDecor(layout, 31));
  });

  it('keeps plots and the plaza clear and stays on land', () => {
    const spots = scatterDecor(layout, 30);
    expect(spots.length).toBeGreaterThan(10);
    for (const s of spots) {
      for (const p of layout.zones.flatMap((z) => z.plots)) {
        expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(p.radius + 1.5);
      }
      const onHub = Math.hypot(s.x, s.z) <= layout.hub.radius;
      const onZone = layout.zones.some((z) => Math.hypot(s.x - z.x, s.z - z.z) <= z.radius);
      expect(onHub || onZone).toBe(true);
      expect(Math.hypot(s.x, s.z) > 7 || !onHub).toBe(true);
    }
  });
});
