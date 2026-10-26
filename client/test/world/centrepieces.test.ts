import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { centrepieces } from '../../src/world/centrepieces';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { seededRandom } from '../../src/world/random';

/** Ids of the props standing on each raised lawn of a shape. */
function lawnTops(shape: string): string[][] {
  const world = shape === 'demo' ? toWorld(fixture) : shapeWorld(399, parseShape(shape));
  const d = designWorld(new IslandLayout(CAMPUS.size).layout(world), world.courseId, CAMPUS.palette);
  const all = d.districts.flatMap((dd) => dd.placements);
  return d.lawns.map((l) => all.filter((p) => Math.abs(p.y - l.h) < 0.05 && Math.hypot(p.x - l.x, p.z - l.z) < l.r).map((p) => p.id));
}

describe('centrepieces', () => {
  it('lists only variants within the room, the same for the same seed', () => {
    for (const room of [0.7, 1, 1.5, 2]) {
      const a = centrepieces(seededRandom(7), room);
      expect(a.length).toBeGreaterThan(0);
      for (const r of a) expect(r.radius).toBeLessThanOrEqual(room);
      expect(centrepieces(seededRandom(7), room)).toEqual(a);
    }
  });

  it.each(['demo', '3,0,5', '8x12'])('%s: every raised lawn carries a centrepiece', (shape) => {
    const tops = lawnTops(shape);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops.filter((t) => t.length === 0)).toEqual([]);
  }, 60_000);

  it('varies the centrepieces over a big course', () => {
    const anchors = new Set(lawnTops('8x12').map((t) => t[0]));
    expect(anchors.size).toBeGreaterThanOrEqual(4);
  }, 60_000);
});
