import type { WorldData } from '../domain/types';
import type { RewardsStore } from '../rewards/rewards-store';
import type { BookController } from '../ui/book-controller';
import { renderCollection, renderQuests, renderTrophies } from '../ui/book-rewards';
import { album, DEFAULT_BOOK_REWARDS_STRINGS, questRows, trophyRows } from '../ui/book-rewards-model';

const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Adds the Quests, Collection and Trophies pages to the book; each reads the latest rewards when shown. */
export function addRewardsPages(book: BookController, store: RewardsStore, world: () => WorldData, lang: Readonly<Record<string, string>>): void {
  const s = { ...DEFAULT_BOOK_REWARDS_STRINGS, ...lang };
  const rewards = () => store.rewards!;
  book.addPage({ id: 'quests', label: s.book_tab_quests, render: () => renderQuests(questRows(rewards(), s, lang)) }, s.book_tab_course);
  book.addPage({ id: 'collection', label: s.book_tab_collection, render: () => renderCollection(album(rewards(), world(), s), s.book_hidden) });
  book.addPage({ id: 'trophies', label: s.book_tab_trophies, render: () => renderTrophies(trophyRows(rewards(), s, (t) => day.format(new Date(t * 1000))), s.book_notrophies) });
}
