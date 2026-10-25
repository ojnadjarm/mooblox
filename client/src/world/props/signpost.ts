import { CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry } from 'three';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { hipRoof } from '../landmarks/shapes';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import { PropColour as C, roundedPanel } from './prop-shapes';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const BACK = -0.3;
const BOARD = 2.25;
const FLOWERS = [0xff7fb6, 0xf6c445, 0xfffaf0, 0xb18cf0];

/** Anything with no page to open (a label): a notice board on two round posts under a little roof, a flower box at its foot. */
export class SignpostFactory implements PropFactory {
  readonly key = 'signpost';

  accepts(a: Activity): boolean {
    return a.url === '';
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const body = new Parts();
    for (const x of [-1.45, 1.45]) {
      body
        .add(new DodecahedronGeometry(0.22, 0).scale(1, 0.6, 1), C.rock, x, 0.1, BACK)
        .add(new CylinderGeometry(0.09, 0.11, 3.0, 8), C.woodShade, x, 1.5, BACK);
    }
    body
      .add(roundedPanel(3.2, 1.28, 0.16, 0.2), C.wood, 0, BOARD, BACK)
      .add(hipRoof(3.5, 0.6, 0.42, C.teal), null, 0, BOARD + 0.68, BACK)
      // Flower box under the board.
      .box(2.2, 0.36, 0.5, C.wood, 0, 0.18, BACK + 0.15)
      .box(2.0, 0.06, 0.38, 0x7a5236, 0, 0.37, BACK + 0.15);
    for (let i = 0; i < 6; i++) {
      const x = -0.8 + i * 0.32;
      body
        .add(new IcosahedronGeometry(0.17, 0), 0x5db761, x, 0.48, BACK + 0.12 + (i % 2) * 0.08)
        .add(new IcosahedronGeometry(0.08, 0), FLOWERS[i % FLOWERS.length]!, x + 0.06, 0.62, BACK + 0.22);
    }
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: BOARD, z: BACK + 0.085, w: 0.96 * SIGN_ASPECT, h: 0.96 },
      flag: null,
      lock: { x: 0, y: 1.2, z: 0 },
    });
  }
}
