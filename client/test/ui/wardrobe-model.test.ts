import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_rewards_demo.json';
import type { RewardsDto } from '../../src/domain/rewards-dto';
import { toRewards } from '../../src/domain/rewards-mapper';
import { NO_LOOK } from '../../src/domain/rewards';
import { DEFAULT_WARDROBE_STRINGS, toggle, wardrobeItems } from '../../src/ui/wardrobe-model';

const rewards = () => toRewards(structuredClone(fixture) as RewardsDto);

describe('wardrobeItems', () => {
  const items = wardrobeItems(rewards(), DEFAULT_WARDROBE_STRINGS);

  it('lists 12 hats, 9 outfits and 6 pets, no trophies', () => {
    expect(['hat', 'outfit', 'pet'].map((s) => items.filter((i) => i.slot === s).length)).toEqual([12, 9, 6]);
  });

  it('marks unlocked items and names how to unlock the rest in advance', () => {
    const r = rewards();
    for (const id of r.unlocks) expect(items.find((i) => i.id === id)).toMatchObject({ unlocked: true, hint: '' });
    expect(items.find((i) => i.id === 'hat-glasses')).toMatchObject({ unlocked: false, hint: 'Finish Lava lab to unlock', name: 'Glasses' });
    expect(items.find((i) => i.id === 'pet-cat')).toMatchObject({ unlocked: false, hint: 'Level up to unlock' });
  });
});

describe('toggle', () => {
  it('wears, swaps and takes off one slot at a time', () => {
    const a = toggle(NO_LOOK, 'hat', 'hat-cap');
    expect(a).toEqual({ hat: 'hat-cap', outfit: null, pet: null });
    expect(toggle(a, 'hat', 'hat-crown').hat).toBe('hat-crown');
    expect(toggle(a, 'hat', 'hat-cap').hat).toBeNull();
    expect(toggle(a, 'hat', null).hat).toBeNull();
    expect(toggle(a, 'pet', 'pet-cat')).toEqual({ hat: 'hat-cap', outfit: null, pet: 'pet-cat' });
  });
});
