import { describe, expect, it } from 'vitest';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { WalkGrid } from '../../src/world/walk-grid';
import { tourGoals, walkPath, type GroundPoint } from '../../src/world/walk-tour';

const policy = new IslandLayout(CAMPUS.size);

/** Islands entered along the path (each change of the island under the walker), sampled every 0.25 m. */
function islandChanges(islands: readonly { x: number; z: number; radius: number }[], path: GroundPoint[]): number {
  let on = -1;
  let changes = 0;
  for (let k = 1; k < path.length; k++) {
    const [a, b] = [path[k - 1]!, path[k]!];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n;
      const z = a.z + ((b.z - a.z) * s) / n;
      const i = islands.findIndex((c) => Math.hypot(c.x - x, c.z - z) < c.radius);
      if (i >= 0 && i !== on) {
        if (on >= 0) changes++;
        on = i;
      }
    }
  }
  return changes;
}

describe('autopilot tour over several bridges', () => {
  for (const [shape, course] of [['8x12', 399], ['20x30', 496]] as const) {
    it(`${shape}: walks on walkable cells and crosses at least 5 bridges`, () => {
      const layout = policy.layout(shapeWorld(course, parseShape(shape)));
      const dressing = designWorld(layout, course, CAMPUS.palette);
      const grid = new WalkGrid(layout, dressing);
      const goals = tourGoals(layout, grid, dressing.start);
      expect(goals).toHaveLength(3);
      expect(new Set(goals.map((g) => g.activityId)).size).toBe(3);
      const path = walkPath(grid, dressing.start, goals);
      let at: GroundPoint = dressing.start;
      for (const p of path) {
        const n = Math.ceil(Math.hypot(p.x - at.x, p.z - at.z) / 0.25);
        for (let s = 1; s <= n; s++) expect(grid.grid[grid.cell(at.x + ((p.x - at.x) * s) / n, at.z + ((p.z - at.z) * s) / n)]).toBe(1);
        at = p;
      }
      expect(path.at(-1)).toBe(goals[2]);
      const changes = islandChanges([...layout.hubs, ...layout.zones], [dressing.start, ...path]);
      expect(changes).toBeGreaterThanOrEqual(5);
    });
  }
});
