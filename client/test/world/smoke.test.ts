import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { puffAt, Smoke, WIND, type Puff, type SmokeSource } from '../../src/world/smoke';

const puff = (): Puff => ({ dx: 0, dy: 0, dz: 0, size: 0, alpha: 0 });

describe('smoke puffs', () => {
  for (const kind of ['chimney', 'campfire'] as const) {
    it(`${kind}: rise, grow, drift downwind and fade in and out`, () => {
      const ages = Array.from({ length: 21 }, (_, i) => i / 20);
      const ps = ages.map((a) => ({ ...puffAt(kind, a, 0.3, puff()) }));
      for (let i = 1; i < ps.length; i++) {
        expect(ps[i]!.dy).toBeGreaterThan(ps[i - 1]!.dy);
        expect(ps[i]!.size).toBeGreaterThanOrEqual(ps[i - 1]!.size);
      }
      expect(ps[0]!.alpha).toBe(0);
      expect(ps[20]!.alpha).toBe(0);
      expect(Math.max(...ps.map((p) => p.alpha))).toBeLessThanOrEqual(1);
      const end = ps[20]!;
      expect(end.dx * WIND.x + end.dz * WIND.z).toBeGreaterThan(0);
      expect(end.size / ps[0]!.size).toBeGreaterThan(3);
    });
  }
});

describe('Smoke', () => {
  const sources: SmokeSource[] = [
    { x: 0, y: 5, z: 0, kind: 'chimney' },
    { x: 10, y: 0, z: 0, kind: 'campfire' },
    { x: 500, y: 5, z: 0, kind: 'chimney' },
  ];
  it('draws every puff of the near sources in one instanced mesh and skips far ones', () => {
    const s = new Smoke(sources, 'high');
    s.update(3, new Vector3(0, 2, 0));
    expect(s.mesh.count).toBe(2 * (s.mesh.instanceMatrix.count / 3));
    s.dispose();
  });
  it('draws nothing on the low tier', () => {
    const s = new Smoke(sources, 'low');
    s.update(3, new Vector3(0, 2, 0));
    expect(s.mesh.count).toBe(0);
  });
});
