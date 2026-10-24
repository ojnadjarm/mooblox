import type { Rewards } from '../domain/rewards';

export type RewardsListener = (next: Rewards, previous: Rewards | null) => void;

/** Holds the user's latest rewards and tells subscribers about each real change, with the value before it. */
export class RewardsStore {
  private current: Rewards | null = null;
  private key = '';
  private readonly listeners = new Set<RewardsListener>();

  get rewards(): Rewards | null {
    return this.current;
  }

  /** Replaces the rewards; returns whether they changed. */
  set(next: Rewards): boolean {
    const key = JSON.stringify(next);
    if (key === this.key) {
      return false;
    }
    const previous = this.current;
    this.current = next;
    this.key = key;
    for (const listener of this.listeners) {
      listener(next, previous);
    }
    return true;
  }

  /** Adds a listener; returns its unsubscribe function. */
  subscribe(listener: RewardsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
