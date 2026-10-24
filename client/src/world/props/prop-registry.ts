import type { Activity } from '../../domain/types';
import type { PropFactory } from './prop';

/** Picks the prop factory of an activity: the first registered one that accepts it, else the fallback. */
export class PropRegistry {
  private readonly factories: PropFactory[] = [];

  constructor(private readonly fallback: PropFactory) {}

  register(factory: PropFactory): this {
    this.factories.push(factory);
    return this;
  }

  resolve(a: Activity): PropFactory {
    return this.factories.find((f) => f.accepts(a)) ?? this.fallback;
  }
}
