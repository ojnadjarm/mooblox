import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { clothWeights, hangingCloth } from '../../src/world/flag-cloth';

/** A 2 m pole at x 0 with a 1 m cloth from x 0.1 to 1.1 between y 1.4 and 1.9. */
function flag(): BufferGeometry {
  const p = [0, 0, 0, 0, 2, 0, 0.05, 2, 0, 0.1, 1.4, 0, 0.1, 1.9, 0, 0.6, 1.5, 0, 0.6, 1.8, 0, 1.1, 1.65, 0];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('sway', new BufferAttribute(new Float32Array(p.length / 3), 1));
  return g;
}

describe('clothWeights', () => {
  it('pins the pole and the cloth root, rising to -1 at the tip', () => {
    const w = Array.from(clothWeights(flag()).getAttribute('sway').array as Float32Array);
    expect(w.slice(0, 3)).toEqual([0, 0, 0]);
    expect(w[3]).toBeCloseTo(0.001 / 1.001 * -1, 2);
    expect(w[5]).toBeCloseTo(-(0.6 - 0.099) / (1.1 - 0.099), 5);
    expect(w[7]).toBe(-1);
    expect(Math.min(...w)).toBe(-1);
    expect(Math.max(...w)).toBeLessThanOrEqual(0);
  });

  it('leaves the pole base still even where it reaches past the cloth root', () => {
    const g = flag();
    (g.getAttribute('position') as BufferAttribute).setX(0, 0.3);
    expect(clothWeights(g).getAttribute('sway').getX(0)).toBe(0);
  });
});

describe('hangingCloth', () => {
  it('swings the red cloth from still at its top to most at its foot and keeps the brown pole still', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, 2.2, 0, 0.3, 2, 0, 0.3, 1.5, 0, 0.3, 1, 0]), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array([0.5, 0.33, 0.2, 0.5, 0.33, 0.2, 0.8, 0.1, 0.1, 0.8, 0.1, 0.1, 0.8, 0.1, 0.1]), 3));
    g.setAttribute('sway', new BufferAttribute(new Float32Array(5), 1));
    const w = Array.from(hangingCloth(g).getAttribute('sway').array as Float32Array);
    expect(w.slice(0, 3)).toEqual([0, 0, 0]);
    expect(w[3]).toBeCloseTo(0.35, 5);
    expect(w[4]).toBeCloseTo(0.7, 5);
  });
});
