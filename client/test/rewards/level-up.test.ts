import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_rewards_demo.json';
import type { RewardsDto } from '../../src/domain/rewards-dto';
import { toRewards } from '../../src/domain/rewards-mapper';
import type { Rewards } from '../../src/domain/rewards';
import { levelUp } from '../../src/rewards/level-up';
import { ITEM_NAMES, itemName } from '../../src/rewards/item-names';
import { COSMETICS } from '../../src/rewards/catalog';

const demo = (): Rewards => toRewards(structuredClone(fixture) as RewardsDto);

describe('levelUp', () => {
  it('fires on a new peak with the items unlocked since', () => {
    const before = demo();
    const after = { ...before, xp: 55, level: 1, peakLevel: 1, unlocks: [...before.unlocks, 'hat-explorer'] };
    expect(levelUp(before, after)).toEqual({ level: 1, items: ['hat-explorer'] });
  });

  it('stays quiet on the first read, the same peak, a drop back and when off', () => {
    const r = demo();
    const up = { ...r, level: 1, peakLevel: 1 };
    expect(levelUp(null, up)).toBeNull();
    expect(levelUp(up, { ...up, xp: up.xp + 5 })).toBeNull();
    expect(levelUp(up, { ...up, level: 0 })).toBeNull();
    expect(levelUp(r, { ...up, enabled: false })).toBeNull();
  });

  it('fires once: the next read after a level-up is quiet', () => {
    const a = demo();
    const b = { ...a, level: 1, peakLevel: 1 };
    const c = { ...b, xp: b.xp + 10 };
    expect([levelUp(a, b), levelUp(b, c)].filter(Boolean)).toHaveLength(1);
  });
});

describe('itemName', () => {
  it('names every catalog item and prefers lang strings', () => {
    expect(Object.keys(ITEM_NAMES)).toHaveLength(Object.keys(COSMETICS).length);
    for (const id of Object.keys(COSMETICS)) expect(itemName(id)).not.toBe(id);
    expect(itemName('hat-explorer')).toBe('Explorer hat');
    expect(itemName('hat-explorer', { item_hat_explorer: 'Sombrero de explorador' })).toBe('Sombrero de explorador');
  });
});

describe('lang', () => {
  it('has a Moodle string for every item and every rewards UI text', async () => {
    const { readFileSync } = await import('node:fs');
    const lang = readFileSync(new URL('../../../moodle/local/mooblox/lang/en/local_mooblox.php', import.meta.url), 'utf8');
    const keys = [...Object.keys(ITEM_NAMES), 'levelup_title', 'levelup_unlocked', 'levelup_tryon', 'levelup_skip', 'hud_level', 'hud_xp', 'hud_progress', 'hud_alldone', 'hud_week', 'hud_weeks', 'wardrobe_tab', 'wardrobe_hat', 'wardrobe_outfit', 'wardrobe_pet', 'wardrobe_none', 'wardrobe_byquest', 'wardrobe_bylevel'];
    expect(keys.filter((k) => !lang.includes(`$string['${k}']`))).toEqual([]);
  });
});
