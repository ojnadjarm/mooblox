import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import type { WorldData } from '../../src/domain/types';
import { COLLECTIBLE_R, COLLECTIBLE_TIERS, placeCollectibles, visibleSpots, type CollectibleItem } from '../../src/world/collectibles';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import type { WorldLayout } from '../../src/world/layout';
import { CAMPUS } from '../../src/world/look';
import { seededRandom } from '../../src/world/random';
import { WalkGrid } from '../../src/world/walk-grid';
import { TIERS } from '../../src/perf/quality';

const SHAPES: Record<string, WorldData> = {
  '1x2': shapeWorld(11, parseShape('1x2')),
  demo: toWorld(fixture),
  '8x12': shapeWorld(812, parseShape('8x12')),
  '20x30': shapeWorld(2030, parseShape('20x30')),
};
const random = seededRandom(1357);
for (let i = 0; i < 6; i++) {
  const shape = Array.from({ length: 1 + Math.floor(random() * 22) }, () => Math.floor(random() * 32));
  SHAPES[`random ${shape.join(',')}`] = shapeWorld(7100 + i, shape);
}

/** Every key the server could unlock for a layout: a gem per activity, a crystal per district, a star per 3 activities. */
const itemsOf = (layout: WorldLayout): CollectibleItem[] => layout.zones.flatMap((z) => [
  ...z.plots.map((p) => ({ key: `gem:${p.activityId}`, kind: 'gem' as const, sectionId: z.sectionId, cmId: p.activityId })),
  ...(z.plots.length ? [{ key: `crystal:${z.sectionId}`, kind: 'crystal' as const, sectionId: z.sectionId, cmId: null }] : []),
  ...Array.from({ length: Math.floor(z.plots.length / 3) }, (_, n) => ({ key: `star:${z.sectionId}:${n}`, kind: 'star' as const, sectionId: z.sectionId, cmId: null })),
]);

const policy = new IslandLayout(CAMPUS.size);

describe('collectible placement for any course shape', () => {
  for (const [name, w] of Object.entries(SHAPES)) {
    describe(name, () => {
      const layout = policy.layout(w);
      const dressing = designWorld(layout, w.courseId, CAMPUS.palette);
      const walk = new WalkGrid(layout, dressing);
      const items = itemsOf(layout);
      const spots = placeCollectibles(layout, dressing.occupancy, walk, w.courseId, items);

      it('places every collectible where the player can walk to it', () => {
        expect(spots.map((s) => s.key).sort()).toEqual(items.map((i) => i.key).sort());
        expect(spots.filter((s) => !walk.reachable(s.x, s.z)).map((s) => s.key)).toEqual([]);
      });

      it('overlaps no solid model, plot or other collectible', () => {
        const bad: string[] = [];
        for (const s of spots) {
          for (const o of dressing.obstacles) if (Math.hypot(s.x - o.x, s.z - o.z) < o.r + COLLECTIBLE_R) bad.push(`${s.key} in model`);
          for (const z of layout.zones) for (const p of z.plots) if (Math.hypot(s.x - p.x, s.z - p.z) < p.radius + COLLECTIBLE_R) bad.push(`${s.key} on plot`);
          if (dressing.occupancy.hits(s.x, s.z, COLLECTIBLE_R)) bad.push(`${s.key} on taken ground`);
        }
        spots.forEach((a, i) => spots.slice(i + 1).forEach((b) => {
          if (Math.hypot(a.x - b.x, a.z - b.z) < 2 * COLLECTIBLE_R) bad.push(`${a.key} x ${b.key}`);
        }));
        expect(bad).toEqual([]);
      });

      it('gives the same spots for the same course and keeps other districts when one changes', () => {
        const again = placeCollectibles(layout, dressing.occupancy, walk, w.courseId, [...items].reverse());
        const sorted = (l: typeof spots) => [...l].sort((a, b) => a.key.localeCompare(b.key));
        expect(sorted(again)).toEqual(sorted(spots));
        const first = layout.zones.find((z) => z.plots.length > 0);
        if (!first) return;
        const fewer = items.filter((i) => i.key !== `gem:${first.plots[0]!.activityId}`);
        const moved = placeCollectibles(layout, dressing.occupancy, walk, w.courseId, fewer).filter((s) => s.sectionId !== first.sectionId);
        expect(sorted(moved)).toEqual(sorted(spots.filter((s) => s.sectionId !== first.sectionId)));
      });

      it('shows at most the tier cap within the tier distance, nearest first', () => {
        const out = new Int32Array(400);
        const dist = new Float32Array(400);
        for (const tier of TIERS) {
          const { max, distance } = COLLECTIBLE_TIERS[tier];
          const n = visibleSpots(spots, layout.spawn.x, layout.spawn.z, tier, out, dist);
          const near = spots.filter((s) => Math.hypot(s.x - layout.spawn.x, s.z - layout.spawn.z) <= distance);
          expect(n).toBe(Math.min(max, near.length));
          for (let i = 1; i < n; i++) expect(dist[i]!).toBeGreaterThanOrEqual(dist[i - 1]!);
          for (let i = 0; i < n; i++) expect(dist[i]!).toBeLessThanOrEqual(distance);
        }
      });
    });
  }

  it('caps a crowd of 1000 at each tier', () => {
    const crowd = Array.from({ length: 1000 }, (_, i) => ({ key: `k${i}`, kind: 'gem' as const, sectionId: 1, x: (i % 30) - 15, z: Math.floor(i / 30) - 15 }));
    const out = new Int32Array(400);
    const dist = new Float32Array(400);
    for (const tier of TIERS) {
      const n = visibleSpots(crowd, 0, 0, tier, out, dist);
      expect(n).toBe(COLLECTIBLE_TIERS[tier].max);
      const all = crowd.map((s) => Math.hypot(s.x, s.z)).sort((a, b) => a - b);
      expect(dist[n - 1]).toBeCloseTo(all[n - 1]!, 4);
    }
  });
});
