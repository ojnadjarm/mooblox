import { describe, expect, it } from 'vitest';
import { QUALITY } from '../../src/perf/quality';
import type { GpuTimer } from '../../src/perf/gpu-timer';
import { QualityManager } from '../../src/perf/quality-manager';
import type { Stage } from '../../src/world/stage';

function fakeStage() {
  const ratios: number[] = [];
  const stage = {
    canvasHost: { clientWidth: 2560, clientHeight: 1440 },
    resize: (r: number) => void ratios.push(r),
    sun: { castShadow: false, shadow: { map: null, mapSize: { x: 0, set(x: number) { this.x = x; } } } },
    dropPost: () => {},
  };
  return { stage: stage as unknown as Stage, ratios };
}

(globalThis as { window?: unknown }).window ??= { devicePixelRatio: 1 };

describe('QualityManager', () => {
  it('starts software GL at the scale floor', () => {
    const { stage } = fakeStage();
    expect(new QualityManager(stage, 'low', null, true).dynamic.scale).toBe(QUALITY.low.minScale);
    expect(new QualityManager(stage, 'high', null, false).dynamic.scale).toBe(1);
  });

  it('starts a canvas over its pixel budget scaled down, at least at the floor', () => {
    const { stage, ratios } = fakeStage();
    expect(new QualityManager(stage, 'high', null, false, () => 2, null, 2560 * 1440).dynamic.scale).toBe(1);
    expect(new QualityManager(stage, 'high', null, false, () => 2, null, 1.6e6).dynamic.scale).toBe(0.65);
    expect(new QualityManager(stage, 'high', null, false, () => 2, null, 1e6).dynamic.scale).toBe(QUALITY.high.minScale);
    const small = new QualityManager(stage, 'high', null, false, () => 2, null, 1e6);
    expect(ratios.at(-1)).toBe(QUALITY.high.minScale);
    small.setTier('medium');
    expect(small.dynamic.scale).toBe(1);
  });

  it('resizes only when the scale moves, not on every slow frame', () => {
    const { stage, ratios } = fakeStage();
    const q = new QualityManager(stage, 'low', null, true);
    const after = ratios.length;
    for (let i = 0; i < 300; i++) q.frame(50);
    expect(ratios.length).toBe(after);
  });

  it('keeps the canvas size on CPU-bound slow frames and steps the tier down after 5 s of them', () => {
    const { stage, ratios } = fakeStage();
    const stored: string[] = [];
    const q = new QualityManager(stage, 'medium', (t) => void stored.push(t), false, () => 22);
    const after = ratios.length;
    for (let i = 0; i < 160; i++) q.frame(25);
    expect(ratios.length).toBe(after);
    for (let i = 0; i < 50; i++) q.frame(25);
    expect(stored).toEqual(['low']);
    expect(q.tier).toBe('low');
  });

  it('steps an asked tier down at the same scale, unremembered, when the GPU cannot fit at the scale floor', () => {
    const { stage, ratios } = fakeStage();
    const timer = { begin: () => {}, end: () => {}, take: (out: number[]) => void out.push(40) } as unknown as GpuTimer;
    const q = new QualityManager(stage, 'high', null, false, () => 2, timer);
    for (let i = 0; i < 60 * 30 && q.tier === 'high'; i++) q.frame(16.7);
    expect(q.tier).toBe('medium');
    expect(q.dynamic.scale).toBe(QUALITY.high.minScale);
    const small = new QualityManager(stage, 'high', null, false, () => 2, null, 1e6);
    expect(ratios.at(-1)).toBe(QUALITY.high.minScale);
    small.setTier('medium');
    expect(small.dynamic.scale).toBe(1);
  });

  it('feeds GPU timings to the governor and times frames outside play without sampling them', () => {
    const { stage, ratios } = fakeStage();
    const calls: string[] = [];
    const timer = {
      begin: () => void calls.push('begin'),
      end: () => void calls.push('end'),
      take: (out: number[]) => void out.push(20),
    } as unknown as GpuTimer;
    const q = new QualityManager(stage, 'high', null, false, () => 2, timer);
    const after = ratios.length;
    q.begin();
    q.frame(0);
    expect(calls).toEqual(['begin', 'end']);
    expect(q.gpuMs).toBe(20);
    for (let i = 0; i < 130; i++) {
      q.begin();
      q.frame(16.7);
    }
    expect(ratios.length).toBe(after + 1);
    expect(q.dynamic.scale).toBeLessThan(1);
  });
});
