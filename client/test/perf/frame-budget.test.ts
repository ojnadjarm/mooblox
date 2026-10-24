import { describe, expect, it } from 'vitest';
import { FrameBudget } from '../../src/perf/frame-budget';

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const POLICY = { target: 1000 / 60, min: 1, max: 8, fill: 0.8 };

/** One frame: begin, `own` ms of own work, `job` ms per background call until the slice is spent, end, then idle to `interval`. */
function frame(b: FrameBudget, c: ReturnType<typeof clock>, own: number, job: number, interval: number): number {
  const start = c.now();
  b.begin();
  c.advance(own);
  let calls = 0;
  b.run(() => {
    c.advance(job);
    calls++;
    return false;
  });
  b.end();
  c.advance(Math.max(0, interval - (c.now() - start)));
  return calls;
}

describe('FrameBudget', () => {
  it('grows the slice up to the room a calm frame leaves, never past max', () => {
    const c = clock();
    const b = new FrameBudget(POLICY, c.now);
    for (let i = 0; i < 40; i++) frame(b, c, 4, 0.5, 1000 / 60);
    expect(b.size).toBeGreaterThan(POLICY.min);
    expect(b.size).toBeLessThanOrEqual(POLICY.max);
    expect(b.size).toBeLessThanOrEqual((1000 / 60) * 0.8 - 4 + 1e-9);
  });

  it('halves the slice after a late frame and reports it', () => {
    const c = clock();
    const b = new FrameBudget(POLICY, c.now);
    for (let i = 0; i < 40; i++) frame(b, c, 2, 0.5, 1000 / 60);
    const before = b.size;
    c.advance(30);
    b.begin();
    expect(b.wasLate).toBe(true);
    expect(b.size).toBeCloseTo(Math.max(POLICY.min, before / 2));
  });

  it('does not call a steady 30 Hz device late every frame', () => {
    const c = clock();
    const b = new FrameBudget(POLICY, c.now);
    let late = 0;
    for (let i = 0; i < 200; i++) {
      frame(b, c, 10, 0.5, 1000 / 30);
      if (i > 100 && b.wasLate) late++;
    }
    expect(late).toBe(0);
    expect(b.size).toBeGreaterThan(8 - 1e-9);
  });

  it('keeps at least the min slice when the frame is full of own work', () => {
    const c = clock();
    const b = new FrameBudget(POLICY, c.now);
    for (let i = 0; i < 20; i++) frame(b, c, 16, 0.5, 1000 / 60);
    expect(b.size).toBe(POLICY.min);
    expect(frame(b, c, 16, 0.5, 1000 / 60)).toBeGreaterThan(0);
  });

  it('stops a job once it reports done', () => {
    const c = clock();
    const b = new FrameBudget(POLICY, c.now);
    b.begin();
    let n = 0;
    expect(b.run(() => ++n === 3)).toBe(true);
    expect(n).toBe(3);
  });
});
