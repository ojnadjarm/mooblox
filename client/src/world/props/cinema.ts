import { CylinderGeometry } from 'three';
import { playable } from '../../domain/media';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { Palette } from '../palette';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const BACK = -0.6;

/** A video (file or YouTube): an outdoor screen with a play button, two seats in front. */
export class CinemaFactory implements PropFactory {
  readonly key = 'cinema';

  accepts(a: Activity): boolean {
    return playable(a) !== null;
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const play = new CylinderGeometry(0.42, 0.42, 0.08, 3);
    play.rotateX(Math.PI / 2);
    play.rotateZ(Math.PI / 2);
    const body = new Parts()
      .box(0.25, 2.2, 0.25, Palette.ink, -1.4, 1.1, BACK - 0.15)
      .box(0.25, 2.2, 0.25, Palette.ink, 1.4, 1.1, BACK - 0.15)
      .box(3.4, 2.1, 0.22, Palette.ink, 0, 2.15, BACK)
      .box(3.1, 1.8, 0.06, Palette.blue, 0, 2.15, BACK + 0.12)
      .add(play, Palette.white, 0.08, 2.15, BACK + 0.17)
      .box(2.9, 0.9, 0.12, Palette.white, 0, 3.75, BACK)
      .box(0.7, 0.35, 0.6, Palette.red, -0.55, 0.18, 0.9)
      .box(0.7, 0.55, 0.15, Palette.red, -0.55, 0.45, 1.15)
      .box(0.7, 0.35, 0.6, Palette.red, 0.55, 0.18, 0.9)
      .box(0.7, 0.55, 0.15, Palette.red, 0.55, 0.45, 1.15);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: 3.75, z: BACK + 0.065, w: 0.82 * SIGN_ASPECT, h: 0.82 },
      flag: { x: 1.75, z: BACK, height: 3.0 },
      lock: { x: 0, y: 2.15, z: BACK + 0.4 },
    });
  }
}
