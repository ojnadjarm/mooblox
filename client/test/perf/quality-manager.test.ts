import { describe, expect, it } from 'vitest';
import { QUALITY } from '../../src/perf/quality';
import { QualityManager } from '../../src/perf/quality-manager';
import type { Stage } from '../../src/world/stage';

function fakeStage() {
  const ratios: number[] = [];
  const stage = {
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

  it('resizes only when the scale moves, not on every slow frame', () => {
    const { stage, ratios } = fakeStage();
    const q = new QualityManager(stage, 'low', null, true);
    const after = ratios.length;
    for (let i = 0; i < 300; i++) q.frame(50);
    expect(ratios.length).toBe(after);
  });
});
