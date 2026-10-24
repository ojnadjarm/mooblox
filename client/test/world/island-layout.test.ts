import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { toWorld } from '../../src/domain/mapper';
import { CompletionState, CompletionTracking } from '../../src/domain/types';
import type { Activity, Section, WorldData } from '../../src/domain/types';
import { IslandLayout } from '../../src/world/island-layout';
import type { Circle } from '../../src/world/layout';

const policy = new IslandLayout();

function activity(id: number, sectionId: number): Activity {
  return {
    id, sectionId, modname: 'page', name: `A${id}`, url: '', purpose: 'content', iconUrl: '', available: true,
    availableInfo: '', dates: [], media: null,
    completion: { tracking: CompletionTracking.None, state: CompletionState.Incomplete, automatic: false },
  };
}

function world(courseId: number, perSection: number[]): WorldData {
  let next = 1;
  const sections: Section[] = perSection.map((count, i) => ({
    id: 100 + i, number: i, name: `S${i}`, available: true, availableInfo: '',
    activities: Array.from({ length: count }, () => activity(next++, 100 + i)),
  }));
  return { courseId, courseName: 'C', firstName: 'Mia', sections };
}

const apart = (a: Circle, b: Circle) => Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius - 1e-9;
const inside = (inner: Circle, outer: Circle) =>
  Math.hypot(inner.x - outer.x, inner.z - outer.z) + inner.radius <= outer.radius + 1e-9;

function pairs<T>(items: readonly T[]): [T, T][] {
  return items.flatMap((a, i) => items.slice(i + 1).map((b): [T, T] => [a, b]));
}

describe('IslandLayout', () => {
  it('is deterministic per course id and differs between courses', () => {
    const w = world(30, [1, 2, 3]);
    expect(policy.layout(w)).toEqual(policy.layout(structuredClone(w)));
    expect(policy.layout(world(31, [1, 2, 3]))).not.toEqual(policy.layout(w));
  });

  it('gives the demo course one zone per section and one plot per activity', () => {
    const w = toWorld(fixture);
    const layout = policy.layout(w);
    expect(layout.zones.map((z) => z.sectionId)).toEqual(w.sections.map((s) => s.id));
    expect(layout.zones.map((z) => z.plots.map((p) => p.activityId)))
      .toEqual(w.sections.map((s) => s.activities.map((a) => a.id)));
  });

  for (let n = 1; n <= 12; n++) {
    it(`fits ${n} section(s) with no overlapping plots or zones`, () => {
      const counts = Array.from({ length: n }, (_, i) => (i * 7 + n) % 11);
      for (const courseId of [1, 30, 987654]) {
        const layout = policy.layout(world(courseId, counts));
        const plots = layout.zones.flatMap((z) => z.plots);
        expect(layout.zones).toHaveLength(n);
        expect(plots).toHaveLength(counts.reduce((a, b) => a + b, 0));
        for (const [a, b] of pairs(plots)) expect(apart(a, b)).toBe(true);
        for (const [a, b] of pairs(layout.zones)) expect(apart(a, b)).toBe(true);
        for (const z of layout.zones) {
          expect(apart(z, layout.hub)).toBe(true);
          expect(inside(z, { x: 0, z: 0, radius: layout.extent })).toBe(true);
          for (const p of z.plots) expect(inside(p, z)).toBe(true);
        }
        expect(layout.extent).toBeLessThanOrEqual(150);
      }
    });
  }
});
