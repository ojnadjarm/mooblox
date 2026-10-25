import { describe, expect, it } from 'vitest';
import { onShelf, outlinePrism, shelfArea, shelfOutline, shelfSamples, shelfSite, type Shelf } from '../../src/world/shelf';

describe('broad shelf', () => {
  const s: Shelf = { rim: 12, at: 0.7, edge: 4, radius: 20 };

  it('outlines the cap of the island beyond the wall: every corner on the island and on the wall side', () => {
    const pts = shelfOutline(s);
    for (const p of pts) {
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(s.rim + 1e-6);
      expect(p.x * Math.cos(s.at) + p.z * Math.sin(s.at)).toBeGreaterThanOrEqual(s.edge - 1e-6);
    }
  });

  it('measures its area like the sample grid does', () => {
    const step = 0.25;
    const counted = shelfSamples(s, step, 0).length * step * step;
    expect(Math.abs(counted - shelfArea(s)) / shelfArea(s)).toBeLessThan(0.05);
  });

  it('keeps samples inside by the inset', () => {
    for (const p of shelfSamples(s, 1, 0.5)) expect(onShelf(s, p.x, p.z, 0.5)).toBe(true);
  });

  it('picks the broadest clear site and none when everything is blocked', () => {
    const free = shelfSite(12, 0, 2, 6, () => false)!;
    expect(free.edge).toBe(2);
    const blockedNear = shelfSite(12, 0, 2, 6, (x) => x < 4.5)!;
    expect(blockedNear.edge).toBeGreaterThanOrEqual(4.5);
    expect(shelfSite(12, 0, 2, 6, () => true)).toBeNull();
  });

  it('builds a closed-top prism facing up', () => {
    const g = outlinePrism(shelfOutline(s), 0, 1.5, 0x9bcb4e);
    const n = g.getAttribute('normal');
    const pos = g.getAttribute('position');
    let up = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) === 1.5 && n.getY(i) > 0.99) up++;
    expect(up).toBeGreaterThan(0);
    for (let i = 0; i < pos.count; i++) expect(n.getY(i)).toBeGreaterThan(-0.01);
  });
});
