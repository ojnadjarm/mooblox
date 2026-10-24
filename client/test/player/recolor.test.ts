import { describe, expect, it } from 'vitest';
import { hslToRgb, recolorClothes, rgbToHsl } from '../../src/player/recolor';

const px = (rgb: number[][]) => new Uint8ClampedArray(rgb.flatMap((c) => [...c, 255]));

describe('recolorClothes', () => {
  it('repaints a green shirt red, keeps skin, greys and pixels outside the rect', () => {
    const data = px([[30, 131, 90], [205, 137, 97], [42, 42, 49], [30, 131, 90]]);
    const changed = recolorClothes(data, 4, 1, 0xe23d2b, [{ x0: 0, y0: 0, x1: 0.75, y1: 1 }]);
    expect(changed).toBe(1);
    const [h] = rgbToHsl(data[0]!, data[1]!, data[2]!);
    expect(h < 15 || h > 345).toBe(true);
    expect([...data.slice(4, 7)]).toEqual([205, 137, 97]);
    expect([...data.slice(8, 11)]).toEqual([42, 42, 49]);
    expect([...data.slice(12, 15)]).toEqual([30, 131, 90]);
  });

  it('hsl round-trips', () => {
    const colours: [number, number, number][] = [[30, 131, 90], [226, 61, 43], [30, 136, 229]];
    for (const c of colours) {
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      hslToRgb(h, s, l).forEach((v, i) => expect(Math.abs(v - c[i]!)).toBeLessThanOrEqual(1));
    }
  });
});
