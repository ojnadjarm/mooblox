import { describe, expect, it } from 'vitest';
import { arrivalSpot, entersCourse } from '../../src/boot/arrival';
import { inOpening, toArch } from '../../src/hub/portal-arch';

describe('arrivalSpot', () => {
  const start = { x: 5, z: 6, face: 1 };

  it('lands the kid beside the return portal, clear of its fluid and inside its site, facing out sideways', () => {
    for (const face of [0, 0.7, 2.5, -2]) {
      const site = { x: 10, z: -4, r: 3.1, face };
      const s = arrivalSpot(site, start);
      const l = toArch(site.x, site.z, site.face, s.x, 1, s.z);
      expect(inOpening(l.x, l.y, l.z)).toBe(false);
      expect(l.z).toBeGreaterThan(1);
      expect(Math.abs(l.x)).toBeGreaterThan(0.8);
      expect(Math.hypot(s.x - site.x, s.z - site.z)).toBeLessThan(site.r);
      expect(s.face).toBeCloseTo(face + Math.PI / 2);
    }
  });

  it('keeps the world start without a portal', () => {
    expect(arrivalSpot(null, start)).toBe(start);
  });
});

describe('entersCourse', () => {
  it('plays the arrival on every way in but a reload', () => {
    for (const type of ['navigate', 'back_forward', 'prerender']) expect(entersCourse({ type })).toBe(true);
    expect(entersCourse(undefined)).toBe(true);
    expect(entersCourse({ type: 'reload' })).toBe(false);
  });
});
