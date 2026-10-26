import { describe, expect, it, vi } from 'vitest';
import { EKey } from '../../src/ui/e-key';

/** A key target that hands back its keydown listener. */
function target(): { add: Pick<Window, 'addEventListener'>; press: (code: string, repeat?: boolean) => void } {
  let listener: (e: unknown) => void = () => {};
  return {
    add: { addEventListener: ((_: string, fn: (e: unknown) => void) => (listener = fn)) as Window['addEventListener'] },
    press: (code, repeat = false) => listener({ code, repeat, target: null, preventDefault: () => {} }),
  };
}

describe('the E key', () => {
  it('runs only the nearest action on offer, never two at once', () => {
    vi.stubGlobal('HTMLInputElement', class {});
    try {
      const t = target();
      const keys = new EKey(t.add);
      const lift = vi.fn();
      const guide = vi.fn();
      const hidden = vi.fn();
      let liftD: number | null = 2;
      keys.add({ distance: () => liftD, run: lift });
      keys.add({ distance: () => 3, run: guide });
      keys.add({ distance: () => null, run: hidden });
      t.press('KeyE');
      expect([lift.mock.calls.length, guide.mock.calls.length, hidden.mock.calls.length]).toEqual([1, 0, 0]);
      liftD = null;
      t.press('KeyE');
      expect([lift.mock.calls.length, guide.mock.calls.length]).toEqual([1, 1]);
      t.press('KeyE', true);
      t.press('KeyQ');
      expect([lift.mock.calls.length, guide.mock.calls.length]).toEqual([1, 1]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stops offering a removed action', () => {
    const keys = new EKey(target().add);
    const remove = keys.add({ distance: () => 1, run: () => {} });
    expect(keys.pick()).not.toBeNull();
    remove();
    expect(keys.pick()).toBeNull();
  });
});
