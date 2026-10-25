import { CylinderGeometry, SphereGeometry } from 'three';
import { playable } from '../../domain/media';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { alternate, gore, lathe } from '../landmarks/shapes';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import { PropColour as C, roundedPanel } from './prop-shapes';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const BACK = -1.15;
const R = 0.95;
const SIDES = 12;
const BARREL = 2.1;
const SCREEN = 1.02;
const MARQUEE = 2.2;

/** A video (file or YouTube): a round wooden picture-house kiosk under a ribbed teal dome, a film camera on top, a screen with a play button and a marquee sign. */
export class CinemaFactory implements PropFactory {
  readonly key = 'cinema';

  accepts(a: Activity): boolean {
    return playable(a) !== null;
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const staves = lathe([[R - 0.08, 0], [R, 0.35], [R + 0.06, 1.05], [R, 1.75], [R - 0.08, BARREL]], SIDES, C.wood, 0, 0, 0, false);
    const dome = lathe([[R + 0.3, 0], [R + 0.22, 0.16], [R - 0.05, 0.62], [0.72, 1.0], [0.3, 1.2], [0, 1.25]], SIDES, C.teal);
    const play = new CylinderGeometry(0.22, 0.22, 0.05, 3);
    play.rotateX(Math.PI / 2);
    play.rotateZ(Math.PI / 2);
    const top = BARREL + 0.28;
    const body = new Parts()
      .add(lathe([[R + 0.25, 0], [R + 0.25, 0.1], [R + 0.15, 0.18], [0, 0.18]], SIDES, C.cream, 0, 0, 0, false), null, 0, 0, BACK)
      .add(alternate(staves, C.woodShade, gore(5)), null, 0, 0.18, BACK)
      .add(lathe([[R + 0.04, 0], [R + 0.09, 0.1], [R + 0.04, 0.2]], SIDES, C.tealShade), null, 0, 0.6, BACK)
      .add(lathe([[R + 0.02, 0], [R + 0.07, 0.1], [R + 0.02, 0.2]], SIDES, C.tealShade), null, 0, 1.65, BACK)
      .add(lathe([[R + 0.02, 0], [R + 0.32, 0.04], [R + 0.34, 0.2], [R + 0.1, 0.28], [0, 0.28]], SIDES, C.cream), null, 0, BARREL + 0.18 - 0.08, BACK)
      .add(alternate(dome, C.tealLight, gore(6)), null, 0, top, BACK)
      // Screen with a play button on the front, framed in cream.
      .add(roundedPanel(1.3, 0.9, 0.12, 0.14), C.cream, 0, SCREEN, BACK + R + 0.06)
      .add(roundedPanel(1.1, 0.68, 0.06, 0.09, 0), C.screen, 0, SCREEN, BACK + R + 0.13)
      .add(play, C.page, 0.05, SCREEN, BACK + R + 0.17)
      // Film camera on the dome: body, lens to the front, two reels on top.
      .add(new SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), C.sun, 0, top + 1.2, BACK)
      .box(0.56, 0.42, 0.62, C.iron, 0, top + 1.55, BACK)
      .add(new CylinderGeometry(0.13, 0.17, 0.3, 8), C.iron, 0, top + 1.55, BACK + 0.44, 0, Math.PI / 2)
      .add(new CylinderGeometry(0.11, 0.11, 0.02, 8), C.glass, 0, top + 1.55, BACK + 0.6, 0, Math.PI / 2);
    for (const x of [-0.27, 0.27]) {
      body
        .add(new CylinderGeometry(0.28, 0.28, 0.1, 12), C.iron, x, top + 2.0, BACK - 0.05, 0, Math.PI / 2)
        .add(new CylinderGeometry(0.1, 0.1, 0.14, 6), C.sun, x, top + 2.0, BACK - 0.05, 0, Math.PI / 2);
    }
    // Marquee board over the screen, hung on the eave.
    body.add(roundedPanel(2.75, 1.0, 0.14, 0.12), C.coral, 0, MARQUEE, BACK + R + 0.42);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: MARQUEE, z: BACK + R + 0.495, w: 0.8 * SIGN_ASPECT, h: 0.8 },
      flag: { x: 1.75, z: BACK - 0.4, height: 3.0 },
      lock: { x: 0, y: SCREEN, z: BACK + R + 0.45 },
    });
  }
}
