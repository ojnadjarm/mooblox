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

  it('picks xhigh only for strong desktop GPUs, and ?quality= overrides it', () => {
    const base = { query: null, memoryGb: 16, cores: 12, coarse: false };
    for (const gpu of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)', 'AMD Radeon RX 7800 XT', 'Apple M3 Max', 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics)']) {
      expect(pickTier({ ...base, gpu }), gpu).toBe('xhigh');
    }
    for (const gpu of ['ANGLE (Intel, Vulkan 1.4 (Intel(R) Iris(R) Xe Graphics (ADL GT2)))', 'Intel(R) UHD Graphics 620', 'Mali-G78', 'Adreno (TM) 740', 'llvmpipe (LLVM 17.0.6, 256 bits)', 'SwiftShader', 'Apple M2', '']) {
      expect(pickTier({ ...base, gpu }), gpu).toBe('high');
    }
    const strong = { ...base, gpu: 'NVIDIA GeForce RTX 3080' };
    expect(pickTier({ ...strong, coarse: true })).toBe('medium');
    expect(pickTier({ ...strong, cores: 6 })).toBe('high');
    expect(pickTier({ ...strong, query: 'high' })).toBe('high');
    expect(pickTier({ ...base, gpu: 'Intel(R) Iris(R) Xe Graphics', query: 'xhigh' })).toBe('xhigh');
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
