import { describe, expect, it } from 'vitest';
import { waterMaterial, WATER_MAX } from '../../src/world/water';
import { CAMPUS } from '../../src/world/look';

describe('water glint', () => {
  it('caps every water pixel under the bloom threshold, so the sun glint never blooms into a cloud', () => {
    expect(WATER_MAX).toBeLessThan(1.4);
    const m = waterMaterial(CAMPUS, [{ x: 0, z: 0, radius: 10 }]);
    expect(m.fragmentShader).toContain(`col = min(col, vec3(${WATER_MAX.toFixed(2)}))`);
    // A power of a base that can pass 1 overflows to a huge value (the T1387 blob).
    expect(m.fragmentShader).not.toMatch(/pow\(max\(h\.y \+/);
  });
});
