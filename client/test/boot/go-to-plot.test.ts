import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { goToPlot, type WorldView } from '../../src/boot/app';
import { toWorld } from '../../src/domain/mapper';
import type { Player } from '../../src/player/player';
import { AccessFence } from '../../src/world/access-fence';
import { IslandLayout } from '../../src/world/island-layout';

function setup(closed: number[], lockedCm: number[] = []) {
  const base = toWorld(fixture);
  const world = { ...base, sections: base.sections.map((s) => ({ ...s, activities: s.activities.map((a) => ({ ...a, available: !lockedCm.includes(a.id) })) })) };
  const layout = new IslandLayout().layout(world);
  const fence = new AccessFence(layout);
  fence.setClosed(new Set(closed));
  const teleport = vi.fn();
  const view = { world, layout, fence } as unknown as WorldView;
  return { go: (id: number) => goToPlot(view, { teleport } as unknown as Player, id), teleport };
}

describe('goToPlot (book "Go there", guide "Show me")', () => {
  it('teleports to an open activity', () => {
    const { go, teleport } = setup([]);
    expect(go(41)).toBe(true);
    expect(teleport).toHaveBeenCalledOnce();
  });

  it('refuses a plot in a closed zone and a locked activity', () => {
    const closed = setup([35]);
    expect(closed.go(42)).toBe(false);
    const locked = setup([], [44]);
    expect(locked.go(44)).toBe(false);
    expect(closed.teleport).not.toHaveBeenCalled();
    expect(locked.teleport).not.toHaveBeenCalled();
  });
});
