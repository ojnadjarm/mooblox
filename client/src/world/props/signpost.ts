import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { Palette } from '../palette';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

/** Anything with no page to open (a label): a wooden signpost with its text. */
export class SignpostFactory implements PropFactory {
  readonly key = 'signpost';

  accepts(a: Activity): boolean {
    return a.url === '';
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const body = new Parts()
      .box(0.3, 2.4, 0.3, Palette.woodDark, 0, 1.2, -0.3)
      .box(3.1, 1.15, 0.16, Palette.wood, 0, 2.2, -0.3)
      .box(0.5, 0.5, 0.18, Palette.wood, 0, 3.0, -0.3)
      .box(0.7, 0.2, 0.7, Palette.stoneDark, 0, 0.1, -0.3);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: 2.2, z: -0.21, w: 0.96 * SIGN_ASPECT, h: 0.96 },
      flag: null,
      lock: { x: 0, y: 1.2, z: 0 },
    });
  }
}
