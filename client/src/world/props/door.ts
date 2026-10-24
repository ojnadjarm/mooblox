import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { Palette, PurposeColor } from '../palette';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const BACK = -0.5;

/** Fallback for any activity: a framed door in the module's purpose colour, its name sign above. */
export class DoorFactory implements PropFactory {
  readonly key = 'door';

  accepts(): boolean {
    return true;
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const body = new Parts()
      .box(2.6, 0.16, 0.9, Palette.stone, 0, 0.08, BACK + 0.2)
      .box(0.36, 3.1, 0.5, Palette.woodDark, -1.05, 1.55, BACK)
      .box(0.36, 3.1, 0.5, Palette.woodDark, 1.05, 1.55, BACK)
      .box(2.5, 0.4, 0.56, Palette.woodDark, 0, 3.2, BACK)
      .box(1.74, 2.95, 0.2, PurposeColor[a.purpose] ?? Palette.pink, 0, 1.6, BACK)
      .box(1.3, 0.12, 0.06, Palette.white, 0, 2.6, BACK + 0.12)
      .box(0.16, 0.16, 0.16, Palette.gold, 0.6, 1.5, BACK + 0.16)
      .box(2.9, 1.06, 0.14, Palette.white, 0, 4.0, BACK);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: 4.0, z: BACK + 0.075, w: 0.96 * SIGN_ASPECT, h: 0.96 },
      flag: { x: 1.7, z: BACK, height: 2.9 },
      lock: { x: 0, y: 1.55, z: BACK + 0.3 },
    });
  }
}
