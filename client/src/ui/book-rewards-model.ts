import type { CollectibleKind, Rewards } from '../domain/rewards';
import type { WorldData } from '../domain/types';
import { itemName } from '../rewards/item-names';
import { fill } from './hud-model';

/** Book texts of the rewards pages; `{item}`, `{found}`, `{total}` and `{date}` are filled in. */
export interface BookRewardsStrings {
  readonly book_tab_course: string;
  readonly book_tab_quests: string;
  readonly book_tab_collection: string;
  readonly book_tab_trophies: string;
  readonly book_unlocks: string;
  readonly book_unlocked: string;
  readonly book_found: string;
  readonly book_hidden: string;
  readonly book_notrophies: string;
  readonly book_earned: string;
}

export const DEFAULT_BOOK_REWARDS_STRINGS: BookRewardsStrings = {
  book_tab_course: 'Course',
  book_tab_quests: 'Quests',
  book_tab_collection: 'Collection',
  book_tab_trophies: 'Trophies',
  book_unlocks: 'Unlocks: {item}',
  book_unlocked: 'You got: {item}',
  book_found: '{found} of {total} found',
  book_hidden: 'Still hidden',
  book_notrophies: 'Earn a badge in this course to put your first trophy on the shelf.',
  book_earned: 'Earned {date}',
};

export interface QuestRow {
  readonly id: string;
  readonly text: string;
  readonly progress: string;
  /** 0..1 */
  readonly fraction: number;
  readonly complete: boolean;
  /** "Unlocks: Lava outfit" before, "You got: Lava outfit" after; empty when the quest gives no item. */
  readonly reward: string;
}

/** Quests in play first (closest to done on top), then not started, then finished ones. */
export function questRows(rewards: Rewards, s: BookRewardsStrings, lang: Readonly<Record<string, string>> = {}): QuestRow[] {
  const rank = (q: { complete: boolean; done: number }) => (q.complete ? 2 : q.done > 0 ? 0 : 1);
  return [...rewards.quests]
    .map((q, i) => ({ q, i }))
    .sort((a, b) => rank(a.q) - rank(b.q) || frac(b.q) - frac(a.q) || a.i - b.i)
    .map(({ q }) => ({
      id: q.id,
      text: q.text,
      progress: `${q.done}/${q.total}`,
      fraction: frac(q),
      complete: q.complete,
      reward: q.reward ? fill(q.complete ? s.book_unlocked : s.book_unlocks, { item: itemName(q.reward, lang) }) : '',
    }));
}

const frac = (q: { done: number; total: number; complete: boolean }) => (q.complete ? 1 : q.total > 0 ? Math.min(1, q.done / q.total) : 0);

/** One album slot: a found collectible shows its kind, everything else stays a "?". */
export interface AlbumSlot {
  readonly key: string;
  readonly kind: CollectibleKind;
  readonly found: boolean;
}

export interface AlbumPage {
  readonly sectionId: number;
  readonly name: string;
  readonly slots: readonly AlbumSlot[];
  readonly found: number;
}

export interface Album {
  readonly pages: readonly AlbumPage[];
  readonly found: number;
  readonly total: number;
  readonly label: string;
}

const KIND_ORDER: Record<CollectibleKind, number> = { gem: 0, crystal: 1, star: 2 };

/** The collection album: one page per district in course order, gems then crystal then stars. */
export function album(rewards: Rewards, world: WorldData, s: BookRewardsStrings): Album {
  const pages = world.sections
    .map((sec) => {
      const slots = rewards.collectibles
        .filter((c) => c.sectionId === sec.id)
        .map((c) => ({ key: c.key, kind: c.kind, found: c.found }))
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key, 'en', { numeric: true }));
      return { sectionId: sec.id, name: sec.name, slots, found: slots.filter((x) => x.found).length };
    })
    .filter((p) => p.slots.length > 0);
  const found = pages.reduce((n, p) => n + p.found, 0);
  const total = pages.reduce((n, p) => n + p.slots.length, 0);
  return { pages, found, total, label: fill(s.book_found, { found, total }) };
}

export interface TrophyRow {
  readonly badgeId: number;
  readonly name: string;
  readonly imageUrl: string;
  readonly earned: string;
}

/** Trophies newest first, with the day each badge was earned. */
export function trophyRows(rewards: Rewards, s: BookRewardsStrings, format: (epoch: number) => string): TrophyRow[] {
  return [...rewards.trophies]
    .sort((a, b) => b.timeIssued - a.timeIssued || a.badgeId - b.badgeId)
    .map((t) => ({ badgeId: t.badgeId, name: t.name, imageUrl: t.imageUrl, earned: fill(s.book_earned, { date: format(t.timeIssued) }) }));
}
