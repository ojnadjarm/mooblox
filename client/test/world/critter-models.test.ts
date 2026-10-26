import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { animalGeometry } from '../../src/world/critter-models';

/** Vertices painted this sRGB colour. */
function painted(kind: 'duck' | 'cat' | 'dog', hex: number): { z: number; y: number }[] {
  const g = animalGeometry(kind);
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const c = new Color(hex);
  const out: { z: number; y: number }[] = [];
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(col.getX(i) - c.r) + Math.abs(col.getY(i) - c.g) + Math.abs(col.getZ(i) - c.b) < 1e-4) out.push({ z: pos.getZ(i), y: pos.getY(i) });
  }
  return out;
}

describe('animals wear the kid avatar face (play-test round 2, item 10)', () => {
  for (const kind of ['duck', 'cat', 'dog'] as const) {
    it(`${kind}: two ink eyes with white highlights and rosy cheeks on the front of the head`, () => {
      const eyes = painted(kind, 0x2b2f3a);
      const eyeTop = Math.min(...eyes.map((p) => p.y));
      const shine = painted(kind, 0xffffff).filter((p) => p.y > eyeTop);
      const cheeks = painted(kind, 0xff8a9a);
      expect(eyes.length).toBeGreaterThanOrEqual(2 * 36);
      expect(shine.length).toBeGreaterThanOrEqual(2 * 36);
      expect(cheeks.length).toBeGreaterThanOrEqual(2 * 36);
      // The face looks forward (+z) from the head, above the body.
      const z = Math.min(...shine.map((p) => p.z));
      expect(z).toBeGreaterThan(kind === 'duck' ? 0.29 : 0.51);
      expect(Math.min(...eyes.map((p) => p.y))).toBeGreaterThan(kind === 'duck' ? 0.3 : 0.45);
    });
  }

  it('each kind has its own markings (more parts than the plain T1309 boxes)', () => {
    const tris = (k: 'duck' | 'cat' | 'dog') => animalGeometry(k).getAttribute('position').count / 3;
    expect(tris('duck')).toBeGreaterThan(4 * 12 + 9 * 12);
    expect(tris('cat')).toBeGreaterThan(10 * 12 + 9 * 12);
    expect(tris('dog')).toBeGreaterThan(10 * 12 + 9 * 12);
  });
});
