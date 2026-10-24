import { describe, expect, it } from 'vitest';
import { hallEntries } from '../../src/boot/trophy-hall';
import type { Trophy } from '../../src/domain/rewards';
import { ATLAS_CELLS, ATLAS_WHITE, atlasCell } from '../../src/world/trophy-atlas';
import { hallCapacity, hallGeometry, metalOf, pedestalSlots } from '../../src/world/trophy-hall';

const site = { x: 10, z: -4, r: 3.6, face: 0.7 };
const trophies = (n: number): Trophy[] => Array.from({ length: n }, (_, i) => ({ badgeId: i + 1, name: `B${i}`, imageUrl: '', timeIssued: 100 - i }));

describe('trophy hall', () => {
  it('fits 9 pedestals on the biggest site, spaced and inside the dais', () => {
    expect(hallCapacity(3.6)).toBe(9);
    const slots = pedestalSlots(20, 3.6);
    expect(slots).toHaveLength(9);
    for (const [i, a] of slots.entries()) {
      expect(Math.hypot(a.x, a.z)).toBeLessThan(3.6 - 0.5);
      if (i) expect(Math.hypot(a.x - slots[i - 1]!.x, a.z - slots[i - 1]!.z)).toBeGreaterThan(1.1);
    }
  });

  it('shows an empty pedestal, then badges oldest first, then a +N plaque past capacity', () => {
    expect(hallEntries([], 9)).toEqual([{ kind: 'empty' }]);
    expect(hallEntries(trophies(3), 9).map((e) => (e.kind === 'badge' ? e.name : e.kind))).toEqual(['B2', 'B1', 'B0']);
    const many = hallEntries(trophies(14), 9);
    expect(many).toHaveLength(9);
    expect(many[8]).toEqual({ kind: 'more', count: 6 });
  });

  it('builds one geometry within the triangle budget, every part coloured and mapped', () => {
    const n = hallCapacity(site.r);
    const metals = Array.from({ length: n }, (_, i) => metalOf(i));
    const { geometry } = hallGeometry(site, metals, metals.map((_, i) => atlasCell(i)), ATLAS_WHITE);
    const tris = geometry.getAttribute('position').count / 3;
    expect(tris).toBeLessThan(3600);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    expect(Math.hypot((b.min.x + b.max.x) / 2 - site.x, (b.min.z + b.max.z) / 2 - site.z)).toBeLessThan(site.r);
    expect(n).toBeLessThanOrEqual(ATLAS_CELLS);
  });
});
