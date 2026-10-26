import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchContext } from '../../src/world/context-watch';

const fire = (t: EventTarget, type: string) => {
  const e = new Event(type, { cancelable: true });
  t.dispatchEvent(e);
  return e;
};

describe('watchContext', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps a lost context restorable and rebuilds on restore', () => {
    const canvas = new EventTarget();
    const restored = vi.fn();
    watchContext(canvas, { restored });
    expect(fire(canvas, 'webglcontextlost').defaultPrevented).toBe(true);
    fire(canvas, 'webglcontextrestored');
    expect(restored).toHaveBeenCalledTimes(1);
  });

  it('reports a loss that outlasts the wait, and the late restore', () => {
    const canvas = new EventTarget();
    const on = { restored: vi.fn(), stuck: vi.fn() };
    watchContext(canvas, on, 5000);
    fire(canvas, 'webglcontextlost');
    vi.advanceTimersByTime(4999);
    expect(on.stuck).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.stuck).toHaveBeenCalledTimes(1);
    fire(canvas, 'webglcontextrestored');
    expect(on.restored).toHaveBeenCalledTimes(1);
  });

  it('a quick restore is not stuck; stop removes the listeners', () => {
    const canvas = new EventTarget();
    const on = { restored: vi.fn(), stuck: vi.fn() };
    const stop = watchContext(canvas, on, 5000);
    fire(canvas, 'webglcontextlost');
    fire(canvas, 'webglcontextrestored');
    vi.advanceTimersByTime(10000);
    expect(on.stuck).not.toHaveBeenCalled();
    stop();
    fire(canvas, 'webglcontextrestored');
    expect(on.restored).toHaveBeenCalledTimes(1);
  });
});
