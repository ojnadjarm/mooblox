import { describe, expect, it } from 'vitest';
import { chimney } from '../../src/world/chimney';
import { CAMPUS } from '../../src/world/look';
import FOOTPRINTS from '../../src/world/model-footprints.json';

const FOOT = FOOTPRINTS as Record<string, { h: number; w: number; r: number }>;
const HOUSES = Object.keys(FOOT).filter((id) => id.startsWith('suburb/building-type-'));

describe('chimney', () => {
  it('stands on every kit house, inside its footprint, and rises above the roof it sits on', () => {
    expect(HOUSES.length).toBeGreaterThan(5);
    for (const id of HOUSES) {
      for (const yaw of [0, 1, 2.5]) {
        const h = 4;
        const c = chimney(id, FOOT[id]!.h, h, 10, -5, yaw, CAMPUS.palette);
        expect(c, id).not.toBeNull();
        const k = h / FOOT[id]!.h;
        expect(Math.hypot(c!.x - 10, c!.z + 5)).toBeLessThan(FOOT[id]!.r * k - 0.3);
        expect(c!.y).toBeGreaterThan(h * 0.3);
        expect(c!.smoke.y).toBeGreaterThan(h * 0.75);
        expect(c!.smoke.x).toBe(c!.x);
      }
    }
  });
});
