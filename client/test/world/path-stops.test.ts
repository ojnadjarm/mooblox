import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { pathPoints, SIGHT_IDS, wayStops } from '../../src/world/path-stops';
import { recipe, WAYSIDE } from '../../src/world/recipes';
import { seededRandom } from '../../src/world/random';

describe('wayside stops', () => {
  it('points run along each segment with a unit left normal, trimmed at both ends', () => {
    const pts = pathPoints([{ ax: 0, az: 0, bx: 10, bz: 0 }], 2, 1);
    expect(pts.map((p) => p.x)).toEqual([1, 3, 5, 7, 9]);
    for (const p of pts) expect([p.nx, p.nz]).toEqual([-0, 1]);
  });

  it('places a stop wherever no sight stands within the spacing, and skips points it cannot place', () => {
    const pts = pathPoints([{ ax: 0, az: 0, bx: 60, bz: 0 }], 1);
    const stops = wayStops(pts, [{ x: 0, z: 0 }], 11, (p) => (p.x > 30 && p.x < 36 ? null : { x: p.x, z: 3 }));
    expect(stops.map((s) => s.x)).toEqual([11, 22, 36, 47, 58]);
  });

  it('every stop holds one sight walkers visit, and sets every yaw (no draws from the world stream)', () => {
    for (const kind of WAYSIDE) {
      for (let seed = 1; seed < 20; seed++) {
        const r = recipe(kind, seededRandom(seed));
        expect(r.items.filter((i) => SIGHT_IDS.has(i.id) && i.solid && !i.detail)).toHaveLength(1);
        expect(r.patch).toBeUndefined();
        for (const i of r.items) expect(i.yaw).toBeDefined();
      }
    }
  });

  for (const [name, w] of [['demo', toWorld(fixture)], ['8x12', shapeWorld(812, parseShape('8x12'))]] as const) {
    it(`${name}: walks carry stops, at most 1 in 5 sights has no other within 24 m (stroll reach)`, () => {
      const layout = new IslandLayout(CAMPUS.size).layout(w);
      const d = designWorld(layout, w.courseId, CAMPUS.palette);
      const sights = d.districts.flatMap((x) => x.placements.filter((p) => SIGHT_IDS.has(p.id)));
      expect(sights.filter((p) => p.id === 'nature/sign').length).toBeGreaterThanOrEqual(2);
      for (const x of d.districts) expect(x.placements.some((p) => SIGHT_IDS.has(p.id))).toBe(true);
      const lonely = sights.filter((s) => !sights.some((o) => o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 24));
      expect(lonely.length).toBeLessThanOrEqual(Math.ceil(sights.length * 0.2));
    });
  }
});
