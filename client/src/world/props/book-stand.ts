import { BoxGeometry } from 'three';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { Palette } from '../palette';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const TILT = -0.45;

/** A page: a lectern with a big open book, its name sign on a board behind. */
export class BookStandFactory implements PropFactory {
  readonly key = 'book-stand';

  accepts(a: Activity): boolean {
    return a.modname === 'page';
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const body = new Parts()
      .box(1.4, 0.2, 1.0, Palette.woodDark, 0, 0.1, 0)
      .box(0.45, 1.1, 0.45, Palette.wood, 0, 0.75, 0)
      .box(1.7, 0.14, 1.1, Palette.woodDark, 0, 1.38, 0, 0, TILT)
      .box(1.6, 0.06, 1.0, Palette.red, 0, 1.47, 0.02, 0, TILT)
      .add(page(), Palette.white, -0.38, 1.52, 0.02, 0, TILT, 0.12)
      .add(page(), Palette.white, 0.38, 1.52, 0.02, 0, TILT, -0.12)
      .box(0.06, 0.08, 0.86, Palette.ink, 0, 1.52, 0.02, 0, TILT)
      .box(0.2, 2.7, 0.2, Palette.woodDark, -1.2, 1.35, -0.9)
      .box(0.2, 2.7, 0.2, Palette.woodDark, 1.2, 1.35, -0.9)
      .box(2.9, 1.06, 0.14, Palette.white, 0, 2.9, -0.9);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: 2.9, z: -0.825, w: 0.96 * SIGN_ASPECT, h: 0.96 },
      flag: { x: 1.6, z: -0.9, height: 2.0 },
      lock: { x: 0, y: 1.9, z: 0.3 },
    });
  }
}

function page(): BoxGeometry {
  return new BoxGeometry(0.74, 0.08, 0.86);
}
