import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { designWorld, modelIds } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { lookouts } from '../../src/world/lookouts';
import { seededRandom } from '../../src/world/random';

/** The dressing of a course shape. */
function dress(shape: string, course = 399) {
  const world = shape === 'demo' ? toWorld(fixture) : shapeWorld(course, parseShape(shape));
  return designWorld(new IslandLayout(CAMPUS.size).layout(world), world.courseId, CAMPUS.palette);
}

/** The shelf-stair destinations of a course shape. */
const design = (shape: string, course = 399) => dress(shape, course).lookouts;

describe('lookouts', () => {
  it('orders the four kinds by seed', () => {
    const a = lookouts(seededRandom(3)).map((l) => l.kind);
    expect([...a].sort()).toEqual(['benches', 'gazebo', 'picnic', 'telescope']);
    expect(lookouts(seededRandom(3)).map((l) => l.kind)).toEqual(a);
  });

  it.each(['demo', '3,0,5', '8x12', '1x2'])('%s: every shelf stair leads up to a destination beyond its head', (shape) => {
    const spots = design(shape);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.filter((s) => s.kind === null)).toEqual([]);
    for (const s of spots) expect(Math.hypot(s.x - s.stair.x, s.z - s.stair.z)).toBeGreaterThan(3);
  }, 60_000);

  it('varies the destinations over courses', () => {
    const kinds = new Set(Array.from({ length: 10 }, (_, i) => design('3x6', i + 1)).flat().map((s) => s.kind));
    expect(kinds.has(null)).toBe(false);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('places only models the boot loads', () => {
    const loaded = new Set(modelIds());
    const placed = new Set(['demo', '3,0,5', '8x12', '3x6'].flatMap((s) => dress(s).districts.flatMap((d) => d.placements.map((p) => p.id))));
    expect([...placed].filter((id) => !loaded.has(id))).toEqual([]);
  }, 120_000);
});
