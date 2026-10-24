import { describe, expect, it } from 'vitest';
import { DistrictStreamer, type StreamUnit } from '../../src/world/district-streamer';

/** A unit that needs `slices` steps; each step advances the fake clock by 1 ms. */
class Unit implements StreamUnit {
  done = 0;
  unloads = 0;
  constructor(
    readonly x: number,
    readonly z: number,
    readonly radius: number,
    private readonly slices: number,
    private readonly clock: { t: number },
  ) {}
  get isBuilt(): boolean {
    return this.done >= this.slices;
  }
  step(): boolean {
    this.clock.t += 1;
    this.done++;
    return this.isBuilt;
  }
  finish(): void {
    while (!this.step());
  }
  unload(): void {
    this.done = 0;
    this.unloads++;
  }
}

const setup = () => {
  const clock = { t: 0 };
  const units = [0, 40, 80, 120, 300].map((x) => new Unit(x, 0, 10, 3, clock));
  const streamer = new DistrictStreamer(units, { sliceMs: 4, keep: 150, drop: 200 }, () => clock.t);
  return { clock, units, streamer };
};

describe('DistrictStreamer', () => {
  it('builds only the first playable area up front', () => {
    const { units, streamer } = setup();
    streamer.buildNear(0, 0, 35);
    expect(units.map((u) => u.isBuilt)).toEqual([true, true, false, false, false]);
  });

  it('builds nearest first within the frame slice, never past keep', () => {
    const { units, streamer } = setup();
    streamer.buildNear(0, 0, 35);
    expect(streamer.pump(0, 0)).toBe(true);
    expect(units.map((u) => u.done)).toEqual([3, 3, 3, 1, 0]);
    expect(streamer.pending).toBe(1);
    for (let i = 0; i < 10; i++) streamer.pump(0, 0);
    expect(units.map((u) => u.isBuilt)).toEqual([true, true, true, true, false]);
    expect(streamer.pending).toBe(0);
  });

  it('frees units past drop and builds what comes into range', () => {
    const { units, streamer } = setup();
    for (let i = 0; i < 10; i++) streamer.pump(0, 0);
    for (let i = 0; i < 10; i++) streamer.pump(300, 0);
    expect(units[0]!.unloads).toBe(1);
    expect(units[0]!.isBuilt).toBe(false);
    expect(units[4]!.isBuilt).toBe(true);
  });

  it('overview keeps and builds everything', () => {
    const { units, streamer } = setup();
    for (let i = 0; i < 10; i++) streamer.pump(0, 0, true);
    expect(units.every((u) => u.isBuilt)).toBe(true);
  });
});
