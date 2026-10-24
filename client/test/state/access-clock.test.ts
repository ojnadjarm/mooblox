import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessClock } from '../../src/state/access-clock';

describe('AccessClock', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('re-reads the course just after the pending date passes', () => {
    const due = vi.fn();
    new AccessClock(due).schedule(1_000_000_000 + 60);
    vi.advanceTimersByTime(60_000);
    expect(due).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(due).toHaveBeenCalledOnce();
  });

  it('keeps one timer: re-scheduling replaces it, 0 disarms', () => {
    const due = vi.fn();
    const clock = new AccessClock(due);
    clock.schedule(1_000_000_000 + 10);
    clock.schedule(1_000_000_000 + 100);
    vi.advanceTimersByTime(20_000);
    expect(due).not.toHaveBeenCalled();
    clock.schedule(0);
    vi.advanceTimersByTime(200_000);
    expect(due).not.toHaveBeenCalled();
  });

  it('caps a far date at six hours and fires a date already past at once', () => {
    const due = vi.fn();
    const clock = new AccessClock(due);
    clock.schedule(1_000_000_000 + 30 * 86400);
    vi.advanceTimersByTime(6 * 3600 * 1000);
    expect(due).toHaveBeenCalledOnce();
    clock.schedule(1_000_000_000 - 5);
    vi.advanceTimersByTime(0);
    expect(due).toHaveBeenCalledTimes(2);
  });
});
