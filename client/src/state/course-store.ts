import type { WorldData } from '../domain/types';

export type WorldListener = (world: WorldData) => void;

/** Holds the current world and notifies subscribers once per real change. */
export class CourseStore {
  private current: WorldData | null = null;
  private key = '';
  private readonly listeners = new Set<WorldListener>();

  get world(): WorldData | null {
    return this.current;
  }

  /** Replaces the world; returns whether it changed. */
  set(world: WorldData): boolean {
    const key = JSON.stringify(world);
    if (key === this.key) {
      return false;
    }
    this.current = world;
    this.key = key;
    for (const listener of this.listeners) {
      listener(world);
    }
    return true;
  }

  /** Adds a listener; returns its unsubscribe function. */
  subscribe(listener: WorldListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
