import { describe, expect, it } from 'vitest';
import { liveHandle } from '../../src/boot/live-handle';

describe('liveHandle', () => {
  it('reads the view getters live after a rebuild and keeps the extras', () => {
    let props = 'first';
    const view = {
      get props() {
        return props;
      },
    };
    const handle = liveHandle(view, { player: 7 });
    props = 'rebuilt';
    expect(handle.props).toBe('rebuilt');
    expect(handle.player).toBe(7);
  });
});
