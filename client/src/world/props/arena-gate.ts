import { OctahedronGeometry } from 'three';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { Palette } from '../palette';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const BACK = -0.4;

/** A quiz: a stone arena gate with towers, red banners and a gold gem on top. */
export class ArenaGateFactory implements PropFactory {
  readonly key = 'arena-gate';

  accepts(a: Activity): boolean {
    return a.modname === 'quiz';
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const body = new Parts();
    for (const side of [-1, 1]) {
      const x = side * 1.45;
      body
        .box(0.9, 3.4, 0.9, Palette.stone, x, 1.7, BACK)
        .box(1.1, 0.25, 1.1, Palette.stoneDark, x, 3.5, BACK)
        .box(0.3, 0.35, 0.3, Palette.stone, x - 0.35, 3.8, BACK - 0.35)
        .box(0.3, 0.35, 0.3, Palette.stone, x + 0.35, 3.8, BACK - 0.35)
        .box(0.3, 0.35, 0.3, Palette.stone, x - 0.35, 3.8, BACK + 0.35)
        .box(0.3, 0.35, 0.3, Palette.stone, x + 0.35, 3.8, BACK + 0.35)
        .box(0.6, 1.3, 0.05, Palette.red, x, 2.3, BACK + 0.48)
        .box(0.24, 0.24, 0.06, Palette.gold, x, 2.4, BACK + 0.52);
    }
    body
      .box(2.0, 0.6, 0.8, Palette.stoneDark, 0, 3.0, BACK)
      .box(2.0, 0.12, 1.0, Palette.stone, 0, 0.06, BACK)
      .box(2.9, 1.0, 0.14, Palette.white, 0, 4.55, BACK)
      .add(new OctahedronGeometry(0.32), Palette.gold, 0, 5.4, BACK);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: 4.55, z: BACK + 0.075, w: 0.9 * SIGN_ASPECT, h: 0.9 },
      flag: { x: 2.0, z: BACK, height: 3.2 },
      lock: { x: 0, y: 1.5, z: BACK + 0.2 },
    });
  }
}
