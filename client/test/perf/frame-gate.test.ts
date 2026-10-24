import { describe, expect, it } from 'vitest';
import { FrameGate } from '../../src/perf/frame-gate';

function fakeRaf() {
  const queue = new Map<number, (t: number) => void>();
  let next = 1;
  let now = 0;
  return {
    raf: (cb: (t: number) => void) => {
      queue.set(next, cb);
      return next++;
    },
    caf: (h: number) => void queue.delete(h),
    step(ms = 16) {
      now += ms;
      const due = [...queue.values()];
      queue.clear();
      due.forEach((cb) => cb(now));
    },
    get pending() {
      return queue.size;
    },
  };
}

describe('FrameGate', () => {
  it('renders every frame while running and passes dt in seconds', () => {
    const r = fakeRaf();
    const dts: number[] = [];
    const gate = new FrameGate((dt) => dts.push(dt), r.raf, r.caf);
    gate.start();
    r.step(16);
    r.step(20);
    r.step(1000);
    expect(dts).toEqual([0, 0.02, 0.1]);
  });

  it('draws nothing while paused unless invalidated', () => {
    const r = fakeRaf();
    const gate = new FrameGate(() => {}, r.raf, r.caf);
    gate.start();
    r.step();
    gate.pause();
    r.step();
    const paused = gate.frames;
    r.step();
    r.step();
    expect(gate.frames).toBe(paused);
    expect(r.pending).toBe(0);
    gate.invalidate();
    r.step();
    r.step();
    expect(gate.frames).toBe(paused + 1);
    gate.resume();
    r.step();
    r.step();
    expect(gate.frames).toBe(paused + 3);
  });

  it('stop cancels the pending frame', () => {
    const r = fakeRaf();
    const gate = new FrameGate(() => {}, r.raf, r.caf);
    gate.start();
    gate.stop();
    r.step();
    expect(gate.frames).toBe(0);
  });
});
