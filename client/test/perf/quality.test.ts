import { describe, expect, it } from 'vitest';
import { DynamicResolution, lowerTier, pickTier, pixelRatio } from '../../src/perf/quality';

describe('quality tiers', () => {
  const laptop = { query: null, memoryGb: 8, cores: 8, coarse: false, gpu: 'ANGLE (Intel, Vulkan 1.4 (Intel(R) Iris(R) Xe Graphics (ADL GT2)))' };

  it('starts laptops medium, phones, tablets, Chromebooks and small devices low', () => {
    expect(pickTier(laptop)).toBe('medium');
    expect(pickTier({ ...laptop, gpu: '' })).toBe('medium');
    expect(pickTier({ ...laptop, coarse: true })).toBe('low');
    expect(pickTier({ ...laptop, memoryGb: 4 })).toBe('low');
    expect(pickTier({ ...laptop, cores: 4 })).toBe('low');
    expect(pickTier({ ...laptop, ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/120' })).toBe('low');
    for (const gpu of ['Mali-G78', 'Adreno (TM) 740', 'PowerVR Rogue GE8320', 'Apple GPU', 'llvmpipe (LLVM 17.0.6, 256 bits)', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)']) {
      expect(pickTier({ ...laptop, gpu }), gpu).toBe('low');
    }
  });

  it('starts strong desktop GPUs high, never xhigh unless asked', () => {
    const desk = { query: null, memoryGb: 16, cores: 12, coarse: false };
    for (const gpu of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)', 'AMD Radeon RX 7800 XT', 'Apple M3 Max', 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics)']) {
      expect(pickTier({ ...desk, gpu }), gpu).toBe('high');
    }
    expect(pickTier({ ...desk, gpu: 'NVIDIA GeForce RTX 3080', cores: 6 })).toBe('medium');
    expect(pickTier({ ...desk, gpu: 'Apple M2' })).toBe('medium');
    expect(pickTier({ ...laptop, query: 'xhigh' })).toBe('xhigh');
  });

  it('lets ?quality= win over a stored step-down, and the stored tier over the probe', () => {
    expect(pickTier({ ...laptop, stored: 'low' })).toBe('low');
    expect(pickTier({ ...laptop, query: 'high', stored: 'low' })).toBe('high');
    expect(pickTier({ ...laptop, query: 'ultra', stored: 'bogus' })).toBe('medium');
  });

  it('steps down one tier at a time', () => {
    expect(lowerTier('xhigh')).toBe('high');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBeNull();
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
  const feed = (d: DynamicResolution, ms: number, seconds: number, work = 0) => {
    let changes = 0;
    for (let t = 0; t < seconds * 1000; t += ms) {
      if (d.sample(ms, work)) changes++;
    }
    return changes;
  };

  it('drops the scale below 50 fps in steps sized from the frame time down to its floor, then reports starvation', () => {
    const d = new DynamicResolution(0.6);
    feed(d, 25, 1);
    expect(d.scale).toBe(0.8);
    feed(d, 25, 1);
    expect(d.scale).toBe(0.65);
    feed(d, 25, 1);
    expect(d.scale).toBe(0.6);
    expect(d.starved).toBe(false);
    feed(d, 25, 1);
    expect(d.scale).toBeCloseTo(0.6);
    expect(d.starved).toBe(true);
  });

  it('never moves the scale for a few one-off hitches in a window at vsync', () => {
    const d = new DynamicResolution(0.6);
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 3; i++) d.sample(120);
      feed(d, 16.7, 0.7);
    }
    expect(d.scale).toBe(1);
  });

  it('holds at 50-57 fps and recovers after three windows at vsync', () => {
    const d = new DynamicResolution(0.5);
    feed(d, 25, 3);
    const low = d.scale;
    feed(d, 18.5, 5);
    expect(d.scale).toBe(low);
    feed(d, 16.7, 2);
    expect(d.scale).toBe(low);
    feed(d, 16.7, 1.1);
    expect(d.scale).toBeCloseTo(low + 0.05);
    feed(d, 16.7, 60);
    expect(d.scale).toBe(1);
    expect(d.starved).toBe(false);
  });

  it('keeps the scale when slow frames are CPU-bound, and asks for a lower tier after 5 such windows', () => {
    const d = new DynamicResolution(0.6);
    expect(feed(d, 25, 4, 22)).toBe(0);
    expect(d.scale).toBe(1);
    expect(d.cpuBound).toBe(true);
    expect(d.starved).toBe(false);
    feed(d, 25, 1, 22);
    expect(d.starved).toBe(true);
    expect(d.scale).toBe(1);
    feed(d, 25, 1, 5);
    expect(d.cpuBound).toBe(false);
    expect(d.scale).toBe(0.8);
  });

  it('never oscillates at a scale on the edge: each failed raise doubles the wait before the next', () => {
    const d = new DynamicResolution(0.5);
    // GPU-bound: frames at vsync up to scale 0.7, 22 ms above it.
    const run = (seconds: number) => {
      let changes = 0;
      for (let s = 0; s < seconds; s++) changes += feed(d, d.scale > 0.7 + 1e-9 ? 22 : 16.7, 1);
      return changes;
    };
    expect(run(60)).toBeLessThanOrEqual(10);
    expect(run(60)).toBeLessThanOrEqual(2);
    expect(d.scale).toBeGreaterThanOrEqual(0.7);
    expect(d.scale).toBeLessThanOrEqual(0.75);
  });

  describe('with GPU timings', () => {
    /** Frames at `ms` for `seconds`, each with a GPU time of `gpu(scale)`. */
    const timed = (d: DynamicResolution, ms: number, seconds: number, gpu: (scale: number) => number, work = 0) => {
      let changes = 0;
      for (let t = 0; t < seconds * 1000; t += ms) {
        d.gpu(gpu(d.scale));
        if (d.sample(ms, work)) changes++;
      }
      return changes;
    };
    /** GPU time following pixels: `full` ms at scale 1. */
    const pixels = (full: number) => (s: number) => full * s * s;

    it('drops after 2 windows with the GPU p90 over budget even though the average frame looks fine', () => {
      const d = new DynamicResolution(0.6);
      timed(d, 17, 1, pixels(17));
      expect(d.scale).toBe(1);
      timed(d, 17, 1, pixels(17));
      expect(d.scale).toBeLessThan(1);
      expect(d.scale).toBeGreaterThanOrEqual(0.8);
      timed(d, 16.7, 30, pixels(17));
      expect(d.scale * d.scale * 17).toBeLessThanOrEqual(15);
    });

    it('keeps the scale on slow frames while the GPU has room (CPU-bound), and asks for a lower tier after 5 windows', () => {
      const d = new DynamicResolution(0.6);
      expect(timed(d, 25, 4, () => 6)).toBe(0);
      expect(d.cpuBound).toBe(true);
      expect(d.scale).toBe(1);
      timed(d, 25, 1, () => 6);
      expect(d.starved).toBe(true);
    });

    it('raises only when the next step is predicted under 11 ms, and settles without oscillating', () => {
      const d = new DynamicResolution(0.5);
      let changes = timed(d, 16.7, 3, pixels(24));
      changes += timed(d, 16.7, 120, pixels(24));
      expect(d.scale * d.scale * 24).toBeLessThanOrEqual(15);
      expect(timed(d, 16.7, 120, pixels(24))).toBe(0);
      expect(changes).toBeLessThanOrEqual(4);
      timed(d, 16.7, 60, pixels(8));
      expect(d.scale).toBe(1);
    });

    it('falls back to frame times when timings are too few', () => {
      const d = new DynamicResolution(0.6);
      for (let i = 0; i < 40; i++) {
        if (i % 10 === 0) d.gpu(30);
        d.sample(25, 0);
      }
      expect(d.scale).toBe(0.8);
    });
  });
});
