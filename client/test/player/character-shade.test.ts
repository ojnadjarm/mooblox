import { describe, expect, it } from 'vitest';
import { buildGeometry } from '../../src/player/character/mesh';
import { box } from '../../src/player/character/parts';

describe('character baked shade', () => {
  it('darkens towards the feet and on faces that look down, leaves the upper body as painted', () => {
    const g = buildGeometry([box('torso', -0.2, 0.2, 1.6, 1.8, -0.2, 0.2, 0xffffff), box('torso', -0.2, 0.2, 0, 0.2, -0.2, 0.2, 0xffffff)]);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    const nor = g.getAttribute('normal');
    let top = Infinity;
    let feet = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (nor.getY(i) < -0.5) continue;
      if (pos.getY(i) > 1.5) top = Math.min(top, col.getX(i));
      if (pos.getY(i) === 0) feet = Math.min(feet, col.getX(i));
    }
    expect(top).toBeCloseTo(1, 5);
    expect(feet).toBeLessThan(0.85);
  });
});
