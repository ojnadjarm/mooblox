import type { Rewards } from '../domain/rewards';

/** A new peak level reached between two reads, with the items unlocked on the way. */
export interface LevelUp {
  readonly level: number;
  readonly items: readonly string[];
}

/** The level-up between `previous` and `next`; null on the first read, without a new peak, or when rewards are off. */
export function levelUp(previous: Rewards | null, next: Rewards): LevelUp | null {
  if (!previous || !next.enabled || next.peakLevel <= previous.peakLevel) {
    return null;
  }
  const had = new Set(previous.unlocks);
  return { level: next.peakLevel, items: next.unlocks.filter((id) => !had.has(id)) };
}
