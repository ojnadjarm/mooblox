import type { Activity } from '../domain/types';
import type { Panel } from '../ui/panel';

/** Opens an activity inside the world; resolves once the learner closes it. */
export interface ActivityOpener {
  canOpen(a: Activity): boolean;
  open(a: Activity, panel: Panel): Promise<void>;
}

/** Strategy chain: the first registered opener that can open the activity wins. */
export class OpenerRegistry {
  private readonly openers: ActivityOpener[] = [];

  register(opener: ActivityOpener): this {
    this.openers.push(opener);
    return this;
  }

  resolve(a: Activity): ActivityOpener | null {
    return this.openers.find((o) => o.canOpen(a)) ?? null;
  }
}
