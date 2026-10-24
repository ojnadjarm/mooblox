import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import type { WorldData } from '../../src/domain/types';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { library, clockTower, lighthouse, science, stadium, theatre } from '../../src/world/landmarks/landmarks';
import { pickThemes } from '../../src/world/landmarks/themes';
import { CAMPUS } from '../../src/world/look';

describe('district themes', () => {
  it('follows the dominant purpose while unused, then the next unused theme', () => {
    expect(pickThemes([['content', 'content', 'assessment'], ['content'], ['assessment'], []])).toEqual(['library', 'science', 'sports', 'arts']);
  });

  it('repeats the five themes past five districts', () => {
    expect(pickThemes(Array.from({ length: 7 }, () => []))).toEqual(['library', 'science', 'sports', 'arts', 'harbour', 'library', 'science']);
  });
});

describe('landmarks', () => {
  const builders = { clockTower, library, science, stadium, theatre, lighthouse };
  for (const [name, build] of Object.entries(builders)) {
    it(`${name} is faceted, finite and within its budget`, () => {
      const lm = build(CAMPUS.palette, 0x2fa39a, 0x1f7a78);
      let tris = 0;
      for (const g of [...lm.parts, ...lm.glow]) {
        expect(g.index).toBeNull();
        const pos = g.getAttribute('position').array;
        const nrm = g.getAttribute('normal').array;
        const col = g.getAttribute('color').array;
        for (const a of [pos, nrm, col]) for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true);
        tris += pos.length / 9;
      }
      expect(tris).toBeLessThanOrEqual(3000);
      expect(lm.height).toBeGreaterThan(7);
    });
  }
});

describe('placement', () => {
  const policy = new IslandLayout(CAMPUS.size);
  const shapes: Record<string, WorldData> = { demo: toWorld(fixture), '8x12': shapeWorld(812, parseShape('8x12')), '1x2': shapeWorld(11, parseShape('1x2')) };
  for (const [name, w] of Object.entries(shapes)) {
    it(`${name}: the hub and every district get a landmark, each at least twice a house (8 m) high`, () => {
      const layout = policy.layout(w);
      const purposes = new Map(w.sections.flatMap((s) => s.activities).map((a) => [a.id, a.purpose]));
      const d = designWorld(layout, w.courseId, CAMPUS.palette, (id) => purposes.get(id));
      expect(d.landmarks.filter((l) => l.theme === 'hub')).toHaveLength(1);
      expect(d.landmarks.filter((l) => l.theme !== 'hub')).toHaveLength(layout.zones.length);
      expect(d.focus).not.toBeNull();
      for (const lm of d.landmarks) expect(lm.top).toBeGreaterThanOrEqual(8);
    });
  }
});
