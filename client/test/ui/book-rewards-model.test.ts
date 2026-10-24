import { describe, expect, it } from 'vitest';
import worldFixture from '../fixtures/get_world_demo.json';
import rewardsFixture from '../fixtures/get_rewards_demo.json';
import type { WorldDto } from '../../src/domain/dto';
import type { RewardsDto } from '../../src/domain/rewards-dto';
import { toWorld } from '../../src/domain/mapper';
import { toRewards } from '../../src/domain/rewards-mapper';
import { album, DEFAULT_BOOK_REWARDS_STRINGS as S, questRows, trophyRows } from '../../src/ui/book-rewards-model';

const rewards = () => toRewards(structuredClone(rewardsFixture) as RewardsDto);
/** The demo world renumbered to the rewards course's sections 40-43. */
const world = () => {
  const dto: WorldDto = structuredClone(worldFixture);
  dto.sections.forEach((s, i) => (s.id = 40 + i));
  dto.sections[0]!.name = 'Reading corner';
  return toWorld(dto);
};

describe('book rewards pages', () => {
  it('lists quests in play first (closest to done), then new ones, then finished, naming each item', () => {
    const rows = questRows(rewards(), S);
    expect(rows.map((r) => r.id)).toEqual(['mod:page', 'sec:41', 'mod:video', 'sec:42', 'sec:43', 'mod:quiz', 'badge:2', 'course', 'sec:40', 'badge:1']);
    expect(rows[0]).toMatchObject({ text: 'Read every page', progress: '3/4', fraction: 0.75, complete: false, reward: 'Unlocks: Pirate hat' });
    expect(rows.at(-1)).toMatchObject({ complete: true, fraction: 1, reward: 'You got: Cap' });
    expect(questRows(rewards(), S, { item_hat_pirate: 'Sombrero pirata' })[0]!.reward).toBe('Unlocks: Sombrero pirata');
  });

  it('builds one album page per district with ? slots for everything not found', () => {
    const r = rewards();
    const found = { ...r, collectibles: r.collectibles.map((c) => (c.key === 'gem:47' || c.key === 'star:40:1' ? { ...c, found: true } : c)) };
    const a = album(found, world(), S);
    expect(a.pages.map((p) => [p.sectionId, p.slots.length, p.found])).toEqual([[40, 5, 2], [41, 3, 0], [42, 3, 0], [43, 2, 0]]);
    expect(a.pages[0]!.slots.map((x) => `${x.kind}:${x.found ? 'Y' : '?'}`)).toEqual(['gem:?', 'gem:Y', 'gem:?', 'crystal:?', 'star:Y']);
    expect([a.found, a.total, a.label]).toEqual([2, 13, '2 of 13 found']);
    expect(a.pages[0]!.name).toBe('Reading corner');
  });

  it('drops districts without collectibles and shows trophies newest first', () => {
    const r = rewards();
    expect(album({ ...r, collectibles: [] }, world(), S).pages).toEqual([]);
    const t = trophyRows({ ...r, trophies: [...r.trophies, { badgeId: 2, name: 'Quiz champ', imageUrl: 'x', timeIssued: r.trophies[0]!.timeIssued + 60 }] }, S, () => '24 Oct');
    expect(t.map((x) => x.name)).toEqual(['Quiz champ', 'Bookworm']);
    expect(t[1]).toMatchObject({ badgeId: 1, earned: 'Earned 24 Oct' });
    expect(trophyRows({ ...r, trophies: [] }, S, String)).toEqual([]);
  });
});
