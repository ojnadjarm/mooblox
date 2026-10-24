import { describe, expect, it } from 'vitest';
import { DynamicResolution, pickTier, pixelRatio } from '../../src/perf/quality';

describe('quality tiers', () => {
  it('picks the starting tier', () => {
    const base = { query: null, memoryGb: 8, cores: 8, coarse: false };
    expect(pickTier(base)).toBe('high');
    expect(pickTier({ ...base, coarse: true })).toBe('medium');
    expect(pickTier({ ...base, memoryGb: 4 })).toBe('low');
    expect(pickTier({ ...base, cores: 4 })).toBe('low');
    expect(pickTier({ ...base, query: 'low' })).toBe('low');
    expect(pickTier({ ...base, query: 'ultra' })).toBe('high');
  });

  it('clamps the pixel ratio per tier', () => {
    expect(pixelRatio('low', 2, 1)).toBe(1);
    expect(pixelRatio('medium', 2, 1)).toBe(1.5);
    expect(pixelRatio('high', 3, 1)).toBe(2);
    expect(pixelRatio('high', 1, 1)).toBe(1);
    expect(pixelRatio('high', 2, 0.6)).toBeCloseTo(1.2);
  });
});

describe('DynamicResolution', () => {
  it('drops scale at 20 fps, floors at 0.6, and recovers at 60 fps', () => {
    const d = new DynamicResolution();
    const feed = (ms: number, seconds: number) => {
      for (let t = 0; t < seconds * 1000; t += ms) {
        d.sample(ms);
      }
    };
    feed(50, 1);
    expect(d.scale).toBeCloseTo(0.9);
    feed(50, 10);
    expect(d.scale).toBeCloseTo(0.6);
    feed(16, 3);
    const recovered = d.scale;
    expect(recovered).toBeGreaterThanOrEqual(0.7 - 1e-9);
    feed(30, 2);
    const steady = d.scale;
    feed(30, 5);
    expect(d.scale).toBe(steady);
    feed(16, 30);
    expect(d.scale).toBe(1);
  });
});
