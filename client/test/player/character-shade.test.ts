import { describe, expect, it } from 'vitest';
import { buildGeometry } from '../../src/player/character/mesh';
import { box } from '../../src/player/character/parts';

describe('character baked shade', () => {
  it('darkens towards the feet and on faces that look down, leaves the top of a body block as painted', () => {
    const g = buildGeometry([box('torso', -0.2, 0.2, 1.7, 1.9, -0.2, 0.2, 0xffffff), box('torso', -0.2, 0.2, 0, 0.2, -0.2, 0.2, 0xffffff)]);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    const nor = g.getAttribute('normal');
    let top = Infinity;
    let feet = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (nor.getY(i) < -0.5) continue;
      if (pos.getY(i) > 1.85) top = Math.min(top, col.getX(i));
      if (pos.getY(i) === 0) feet = Math.min(feet, col.getX(i));
    }
    expect(top).toBeCloseTo(1, 5);
    expect(feet).toBeLessThan(0.85);
  });

  it('shades each body block from its top down, continuous across stacked segments', () => {
    const g = buildGeometry([box('arm-left', 0.4, 0.8, 0.8, 1.2, -0.3, 0.1, 0xffffff), box('arm-left', 0.4, 0.8, 1.2, 1.9, -0.3, 0.1, 0xffffff)]);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    const nor = g.getAttribute('normal');
    const at = (y: number) => [...Array(pos.count).keys()].filter((i) => nor.getY(i) === 0 && Math.abs(pos.getY(i) - y) < 1e-6).map((i) => col.getX(i));
    expect(Math.min(...at(1.2))).toBeCloseTo(Math.max(...at(1.2)), 5);
    expect(Math.max(...at(0.8))).toBeLessThan(Math.min(...at(1.9)));
  });
});
