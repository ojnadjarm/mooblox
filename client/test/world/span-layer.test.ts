import { describe, expect, it } from 'vitest';
import { Box3, Group } from 'three';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { SpanLayer, type SpanBuild } from '../../src/world/span-layer';

/** A span build that takes `slices` steps (or waits on the worker while `busy`). */
function fake(x: number, z: number, radius: number, slices = 2): SpanBuild<string> & { steps: number; finished: number } {
  let left = slices;
  return {
    group: new Group(),
    district: { island: { x, z, radius } },
    busy: false,
    bounds: new Box3(),
    steps: 0,
    finished: 0,
    get isBuilt() {
      return left === 0;
    },
    get collider() {
      return left === 0 ? `c${x}` : null;
    },
    step() {
      this.steps++;
      left = Math.max(0, left - 1);
      return left === 0;
    },
    finish() {
      this.finished++;
      left = 0;
    },
    unload() {
      left = slices;
    },
  };
}

const runAll = (job: () => boolean) => {
  while (!job());
};

describe('SpanLayer', () => {
  it('builds the span nearest the player first and reports it once built', () => {
    const far = fake(100, 0, 5);
    const near = fake(20, 0, 5);
    const layer = new SpanLayer([far, near]);
    expect(layer.step(0, 0, runAll)).toBe(near);
    expect(far.steps).toBe(0);
    expect(layer.step(0, 0, runAll)).toBe(far);
    expect(layer.step(0, 0, runAll)).toBeNull();
    expect(layer.parts().map((p) => p.collider)).toEqual(['c100', 'c20']);
  });

  it('finishes only the spans within reach, inline', () => {
    const a = fake(10, 0, 5);
    const b = fake(40, 0, 5);
    const layer = new SpanLayer([a, b]);
    expect(layer.finishNear(0, 0, 6)).toEqual([a]);
    expect(a.finished).toBe(1);
    expect(b.isBuilt).toBe(false);
  });

  it('hides spans wholly in the haze, shows every span in the overview', () => {
    const a = fake(10, 0, 5);
    const b = fake(80, 0, 5);
    const layer = new SpanLayer([a, b]);
    layer.cull(0, 0, 50, false);
    expect([a.group.visible, b.group.visible]).toEqual([true, false]);
    layer.cull(0, 0, 50, true);
    expect(b.group.visible).toBe(true);
  });
});

describe('designWorld spans', () => {
  it.each(['demo', '8x12'])('%s: one span per bridge holds its planks; no island district does', (shape) => {
    const world = shape === 'demo' ? toWorld(fixture) : shapeWorld(300, parseShape(shape));
    const d = designWorld(new IslandLayout(CAMPUS.size).layout(world), world.courseId, CAMPUS.palette);
    expect(d.spans.length).toBe(d.bridges.length);
    for (const s of d.spans) expect(s.placements.some((p) => p.id === 'nature/bridge_center_wood')).toBe(true);
    for (const district of d.districts) expect(district.placements.some((p) => p.id === 'nature/bridge_center_wood')).toBe(false);
    // Every part of a span is base dressing: one merged mesh per bridge, never dropped with distance.
    for (const s of d.spans) expect([...s.placements, ...s.terrain].every((p) => !p.detail)).toBe(true);
  });
});
