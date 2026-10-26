import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import rewardsFixture from '../fixtures/get_rewards_demo.json';
import type { WorldDto } from '../../src/domain/dto';
import { toWorld } from '../../src/domain/mapper';
import { toRewards } from '../../src/domain/rewards-mapper';
import { doneIds, Footfall, isJump, mixGains, newlyDone, rewardCue } from '../../src/audio/cues';

describe('isJump', () => {
  it('takes only the take-off kick', () => {
    expect([1, 2, 3, 4].map(isJump)).toEqual([false, false, true, false]);
  });
});

describe('Footfall', () => {
  const walk = (f: Footfall, speed: number, seconds: number, grounded = true, from = 0) => {
    const out: string[] = [];
    for (let i = 1; i <= seconds * 60; i++) {
      const cue = f.update(from + (speed * i) / 60, 0, grounded, 1 / 60);
      if (cue) out.push(cue);
    }
    return out;
  };
  it('steps about 3-4 times a second walking and faster running, none standing', () => {
    expect(walk(new Footfall(), 6, 2).length).toBeGreaterThanOrEqual(6);
    expect(walk(new Footfall(), 6, 2).length).toBeLessThanOrEqual(9);
    expect(walk(new Footfall(), 10, 2).length).toBeGreaterThan(walk(new Footfall(), 6, 2).length);
    expect(walk(new Footfall(), 0, 2)).toEqual([]);
  });
  it('lands once after air time and ignores teleports', () => {
    const f = new Footfall();
    f.update(0, 0, true, 1 / 60);
    for (let i = 0; i < 30; i++) f.update(0, 0, false, 1 / 60);
    expect(f.update(0, 0, true, 1 / 60)).toBe('land');
    expect(f.landedAfter).toBeCloseTo(0.5);
    expect(f.update(50, 0, true, 1 / 60)).toBeNull();
  });
});

describe('completion cue', () => {
  it('fires only when an activity becomes done', () => {
    const dto: WorldDto = structuredClone(fixture);
    const before = doneIds(toWorld(dto));
    const cm = dto.sections[3]!.modules[0]!;
    expect(before.has(cm.id)).toBe(false);
    Object.assign(cm, { state: 1, done: true });
    const after = doneIds(toWorld(dto));
    expect(newlyDone(before, after)).toBe(true);
    expect(newlyDone(after, before)).toBe(false);
    expect(newlyDone(after, after)).toBe(false);
  });
});

describe('rewardCue', () => {
  const base = toRewards(structuredClone(rewardsFixture));
  it('is quiet on the first read, dings on XP and plays the level-up on a new peak', () => {
    expect(rewardCue(null, base)).toBeNull();
    expect(rewardCue(base, base)).toBeNull();
    expect(rewardCue(base, { ...base, xp: base.xp + 5 })).toBe('xp');
    expect(rewardCue(base, { ...base, xp: base.xp + 60, peakLevel: base.peakLevel + 1 })).toBe('levelup');
    expect(rewardCue(base, { ...base, enabled: false, xp: base.xp + 5 })).toBeNull();
  });
});

describe('mixGains', () => {
  const m = { on: true, volume: 0.5, video: false, panel: false, hidden: false };
  it('silences for mute, video and a hidden tab, and steps the music back under a panel', () => {
    expect(mixGains(m)).toEqual({ master: 0.25, music: 1 });
    expect(mixGains({ ...m, on: false }).master).toBe(0);
    expect(mixGains({ ...m, video: true }).master).toBe(0);
    expect(mixGains({ ...m, hidden: true }).master).toBe(0);
    expect(mixGains({ ...m, panel: true }).music).toBeLessThan(1);
  });
});
