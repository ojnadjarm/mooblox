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

const PLAYER = 0.5;
const CELL = 0.5;

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

/** Cells the player's centre can stand on: island discs and bridge decks, minus solid footprints. */
function walkable(layout: WorldLayout, dressing: Dressing) {
  const islands = [...layout.hubs, ...layout.zones];
  const minX = Math.min(...islands.map((c) => c.x - c.radius)) - 2;
  const minZ = Math.min(...islands.map((c) => c.z - c.radius)) - 2;
  const w = Math.ceil((Math.max(...islands.map((c) => c.x + c.radius)) + 2 - minX) / CELL);
  const h = Math.ceil((Math.max(...islands.map((c) => c.z + c.radius)) + 2 - minZ) / CELL);
  const grid = new Uint8Array(w * h);
  const paint = (x0: number, z0: number, x1: number, z1: number, test: (x: number, z: number) => boolean, value: number) => {
    for (let j = Math.max(0, Math.floor((z0 - minZ) / CELL)); j <= Math.min(h - 1, Math.ceil((z1 - minZ) / CELL)); j++) {
      for (let i = Math.max(0, Math.floor((x0 - minX) / CELL)); i <= Math.min(w - 1, Math.ceil((x1 - minX) / CELL)); i++) {
        if (test(minX + i * CELL, minZ + j * CELL)) grid[j * w + i] = value;
      }
    }
  };
  for (const c of islands) {
    const r = c.radius - PLAYER;
    paint(c.x - r, c.z - r, c.x + r, c.z + r, (x, z) => Math.hypot(x - c.x, z - c.z) <= r, 1);
  }
  for (const b of dressing.bridges) {
    const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
    const [ux, uz] = [(b.bx - b.ax) / len, (b.bz - b.az) / len];
    const half = DECK_HALF - PLAYER;
    paint(Math.min(b.ax, b.bx) - 2, Math.min(b.az, b.bz) - 2, Math.max(b.ax, b.bx) + 2, Math.max(b.az, b.bz) + 2, (x, z) => {
      const t = (x - b.ax) * ux + (z - b.az) * uz;
      return t >= -1 && t <= len + 1 && Math.abs((x - b.ax) * uz - (z - b.az) * ux) <= half;
    }, 1);
  }
  for (const o of dressing.obstacles) {
    const r = o.r + PLAYER;
    paint(o.x - r, o.z - r, o.x + r, o.z + r, (x, z) => Math.hypot(x - o.x, z - o.z) < r, 0);
  }
  const cell = (x: number, z: number) => Math.round((z - minZ) / CELL) * w + Math.round((x - minX) / CELL);
  return { grid, w, h, cell };
}

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
        plots.forEach((a, i) => plots.slice(i + 1).forEach((b) => expect(gap(a, b)).toBeGreaterThanOrEqual(0)));
        for (const z of layout.zones) {
          const near = dressing.obstacles.map((o) => ({ x: o.x, z: o.z, radius: o.r })).filter((o) => gap(o, z) < 0);
          for (const o of near) for (const p of z.plots) expect(gap(o, p)).toBeGreaterThan(0);
        }
        for (const b of dressing.bridges) {
          for (const o of dressing.obstacles) {
            const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
            const t = Math.max(0, Math.min(len, ((o.x - b.ax) * (b.bx - b.ax) + (o.z - b.az) * (b.bz - b.az)) / len));
            const d = Math.hypot(b.ax + ((b.bx - b.ax) * t) / len - o.x, b.az + ((b.bz - b.az) * t) / len - o.z);
            expect(d).toBeGreaterThan(o.r + DECK_HALF);
          }
        }
      });

      it('lets the player walk from the spawn to every plot', () => {
        const { grid, w: gw, h, cell } = walkable(layout, dressing);
        const start = cell(layout.spawn.x, layout.spawn.z);
        expect(grid[start]).toBe(1);
        const seen = new Uint8Array(gw * h);
        const queue = new Int32Array(gw * h);
        let [head, tail] = [0, 0];
        queue[tail++] = start;
        seen[start] = 1;
        while (head < tail) {
          const c = queue[head++]!;
          const x = c % gw;
          for (const n of [x > 0 ? c - 1 : -1, x < gw - 1 ? c + 1 : -1, c - gw, c + gw]) {
            if (n >= 0 && n < gw * h && grid[n] && !seen[n]) {
              seen[n] = 1;
              queue[tail++] = n;
            }
          }
        }
        const unreached = layout.zones.flatMap((z) => z.plots).filter((p) => !seen[cell(p.x, p.z)]);
        expect(unreached.map((p) => p.activityId)).toEqual([]);
      });
    });
  }
});
