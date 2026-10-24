import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_rewards_demo.json';
import { assertRewardsDto, toLook, toLookDto, toRewards, toRewardsDto } from '../../src/domain/rewards-mapper';

describe('rewards mapper', () => {
  it('accepts the get_rewards reply captured from Moodle 5.2 as the wire shape', () => {
    expect(() => assertRewardsDto(fixture)).not.toThrow();
  });

  it('round-trips the captured reply', () => {
    assertRewardsDto(fixture);
    expect(toRewardsDto(toRewards(fixture))).toEqual(fixture);
  });

  it('maps to domain fields: empty reward and gem-less cm become null', () => {
    assertRewardsDto(fixture);
    const r = toRewards(fixture);
    expect([r.xp, r.level, r.levelNext]).toEqual([45, 0, 50]);
    expect(r.quests.map((q) => q.kind)).toContain('badge');
    expect(r.collectibles.find((c) => c.kind === 'crystal')?.cmId).toBeNull();
    expect(r.collectibles.find((c) => c.kind === 'gem')?.cmId).toBeGreaterThan(0);
    expect(r.look).toEqual({ hat: null, outfit: null, pet: null });
    expect(r.trophies[0]?.imageUrl.startsWith('https://moodle.example/')).toBe(true);
  });

  it('rejects a missing, extra or mistyped field', () => {
    const copy = () => structuredClone(fixture) as unknown as Record<string, unknown>;
    const missing = copy();
    delete missing.unlocks;
    expect(() => assertRewardsDto(missing)).toThrow(/fields/);
    expect(() => assertRewardsDto({ ...copy(), extra: 1 })).toThrow(/fields/);
    const typed = copy();
    (typed.quests as Record<string, unknown>[])[0]!.done = '3';
    expect(() => assertRewardsDto(typed)).toThrow(/quests\[0\]\.done/);
  });

  it('maps looks between wire and domain', () => {
    expect(toLook({ hat: 'hat-cap', outfit: '', pet: '' })).toEqual({ hat: 'hat-cap', outfit: null, pet: null });
    expect(toLookDto({ hat: null, outfit: 'outfit-lava', pet: null })).toEqual({ hat: '', outfit: 'outfit-lava', pet: '' });
  });
});
