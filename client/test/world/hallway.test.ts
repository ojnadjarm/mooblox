import { describe, expect, it } from 'vitest';
import { HALLWAY, HAZE_BAND, HallwayLog, hallwayLength, hiddenLength, LOW_BUILD_S, POP_FOG } from '../../src/world/hallway';
import { Physics } from '../../src/player/controller';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { islandGraph } from '../../src/world/island-streamer';

describe('hallway bridges', () => {
  it('gives the low tier its worst build plus the margin at run speed, and hides the island across at POP_FOG', () => {
    expect(hallwayLength(1.4, 10, 1)).toBe(24);
    const x = (hiddenLength(HAZE_BAND) - HAZE_BAND.near) / (HAZE_BAND.far - HAZE_BAND.near);
    expect(x * x * (3 - 2 * x)).toBeCloseTo(POP_FOG, 5);
    expect(HALLWAY).toBeGreaterThanOrEqual(hallwayLength(LOW_BUILD_S, Physics.run));
    expect(HALLWAY).toBeGreaterThanOrEqual(hiddenLength(HAZE_BAND));
  });

  it.each([['demo-like 4x6', 4, '4x6'], ['8x12', 812, '8x12'], ['20x30', 2030, '20x30'], ['3,0,5', 35, '3,0,5']])('%s: every bridge is at least HALLWAY long', (_n, course, shape) => {
    const layout = new IslandLayout(CAMPUS.size).layout(shapeWorld(course as number, parseShape(shape as string)));
    const { islands, bridges } = islandGraph(layout);
    for (const b of bridges) {
      const a = islands[b.a]!;
      const c = islands[b.b]!;
      expect(Math.hypot(a.x - c.x, a.z - c.z) - a.radius - c.radius).toBeGreaterThanOrEqual(HALLWAY - 1e-6);
    }
  });
});

describe('HallwayLog', () => {
  it('times background builds from their first slice and counts inline builds and switch-ons under POP_FOG as pops', () => {
    const log = new HallwayLog();
    log.step(3, 100);
    log.step(3, 150);
    log.ready(3, 900);
    log.show(3, 1000, 0.95);
    log.show(4, 1100, 0.2);
    log.inline(5, 1200, 40);
    expect(log.summary()).toEqual({ builds: 1, worstBuildMs: 800, inline: 1, pops: 2 });
  });
});
