import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import type { WorldData } from '../../src/domain/types';
import { DECK_HALF, designWorld, type Dressing } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import type { Circle, WorldLayout } from '../../src/world/layout';
import { CAMPUS } from '../../src/world/look';
import { seededRandom } from '../../src/world/random';
import { WalkGrid } from '../../src/world/walk-grid';

const SHAPES: Record<string, WorldData> = {
  '1x2': shapeWorld(11, parseShape('1x2')),
  demo: toWorld(fixture),
  '8x12': shapeWorld(812, parseShape('8x12')),
  '20x30': shapeWorld(2030, parseShape('20x30')),
  'section 0 only': shapeWorld(5, parseShape('0')),
  'empty sections': shapeWorld(6, parseShape('0,0,4,0,0')),
};
const random = seededRandom(1309);
for (let i = 0; i < 6; i++) {
  const shape = Array.from({ length: 1 + Math.floor(random() * 22) }, () => Math.floor(random() * 32));
  SHAPES[`random ${shape.join(',')}`] = shapeWorld(7000 + i, shape);
}

const policy = new IslandLayout(CAMPUS.size);
const build = (w: WorldData): { layout: WorldLayout; dressing: Dressing } => {
  const layout = policy.layout(w);
  return { layout, dressing: designWorld(layout, w.courseId, CAMPUS.palette) };
};
const plain = (d: Dressing) => ({
  placements: d.districts.map((x) => x.placements),
  terrain: d.districts.map((x) => x.terrain.map((t) => Array.from(t.geometry.getAttribute('position').array.slice(0, 9)))),
  life: d.life, paths: d.paths, obstacles: d.obstacles, bridges: d.bridges,
});
const gap = (a: Circle, b: Circle) => Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;

describe('campus layout and dressing for any course shape', () => {
  for (const [name, w] of Object.entries(SHAPES)) {
    describe(name, () => {
      const { layout, dressing } = build(w);

      it('is the same world for the same course id', () => {
        const again = build(structuredClone(w));
        expect(again.layout).toEqual(layout);
        expect(plain(again.dressing)).toEqual(plain(dressing));
      });

      it('has no overlapping islands, plots, or solid models on plots and bridges', () => {
        const islands = [...layout.hubs, ...layout.zones];
        islands.forEach((a, i) => islands.slice(i + 1).forEach((b) => expect(gap(a, b)).toBeGreaterThan(0)));
        const plots = layout.zones.flatMap((z) => z.plots);
        expect(plots).toHaveLength(w.sections.reduce((n, s) => n + s.activities.length, 0));
        for (const z of layout.zones) for (const p of z.plots) expect(Math.hypot(p.x - z.x, p.z - z.z) + p.radius).toBeLessThanOrEqual(z.radius);
        const hits: string[] = [];
        plots.forEach((a, i) => plots.slice(i + 1).forEach((b) => !(gap(a, b) >= 0) && hits.push(`plot ${a.x},${a.z} x plot ${b.x},${b.z}`)));
        for (const z of layout.zones) {
          const near = dressing.obstacles.map((o) => ({ x: o.x, z: o.z, radius: o.r })).filter((o) => gap(o, z) < 0);
          for (const o of near) for (const p of z.plots) if (!(gap(o, p) > 0)) hits.push(`solid ${o.x},${o.z} x plot ${p.x},${p.z}`);
        }
        for (const b of dressing.bridges) {
          for (const o of dressing.obstacles) {
            const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
            const t = Math.max(0, Math.min(len, ((o.x - b.ax) * (b.bx - b.ax) + (o.z - b.az) * (b.bz - b.az)) / len));
            const d = Math.hypot(b.ax + ((b.bx - b.ax) * t) / len - o.x, b.az + ((b.bz - b.az) * t) / len - o.z);
            if (!(d > o.r + DECK_HALF)) hits.push(`solid ${o.x},${o.z} x bridge ${b.ax},${b.az}`);
          }
        }
        expect(hits).toEqual([]);
      });

      it('never places one solid model inside another (footprint overlap)', () => {
        const solids = [...dressing.obstacles].sort((a, b) => a.x - b.x);
        const maxR = Math.max(0, ...solids.map((o) => o.r));
        const overlaps: string[] = [];
        for (let i = 0; i < solids.length; i++) {
          const a = solids[i]!;
          for (let j = i + 1; j < solids.length && solids[j]!.x - a.x < a.r + maxR; j++) {
            const b = solids[j]!;
            if (Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r - 1e-6) overlaps.push(`${a.x.toFixed(1)},${a.z.toFixed(1)} r${a.r.toFixed(2)} x ${b.x.toFixed(1)},${b.z.toFixed(1)} r${b.r.toFixed(2)}`);
          }
        }
        expect(overlaps).toEqual([]);
        const placedSolids = dressing.districts.flatMap((d) => d.placements).filter((p) => p.solid && p.y < 1 && p.id !== 'nature/bridge_center_wood');
        expect(placedSolids.length).toBeLessThanOrEqual(solids.length);
        expect(dressing.districts.flatMap((d) => d.placements).filter((p) => (p.minor || p.rich) && p.solid)).toEqual([]);
      });

      it('lets the player walk from the start to every plot', () => {
        const walk = new WalkGrid(layout, dressing);
        expect(walk.grid[walk.cell(dressing.start.x, dressing.start.z)]).toBe(1);
        const seen = walk.reached();
        const cell = (x: number, z: number) => walk.cell(x, z);
        const unreached = layout.zones.flatMap((z) => z.plots).filter((p) => !seen[cell(p.x, p.z)]);
        expect(unreached.map((p) => p.activityId)).toEqual([]);
      });
    });
  }
});
