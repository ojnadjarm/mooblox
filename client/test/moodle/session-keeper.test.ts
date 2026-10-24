import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepSessionAlive } from '../../src/moodle/session-keeper';

afterEach(() => {
  vi.useRealTimers();
});

describe('keepSessionAlive', () => {
  it('touches the session each interval until stopped and reports failures', async () => {
    vi.useFakeTimers();
    const failure = new Error('gone');
    const touchSession = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);
    const onError = vi.fn();
    const stop = keepSessionAlive({ touchSession }, 1000, onError);

    await vi.advanceTimersByTimeAsync(2000);
    expect(touchSession).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(failure);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(touchSession).toHaveBeenCalledTimes(2);
  });
});
