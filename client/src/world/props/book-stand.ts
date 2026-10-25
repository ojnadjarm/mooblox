import { BoxGeometry, CylinderGeometry } from 'three';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import { awning, PropColour as C, roundedPanel, scallops } from './prop-shapes';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const TILT = -0.5;
const W = 2.7;
const BACK = -1.2;
const FRONT = -0.1;
const POST = 2.35;
const SHADE_R = 1.6;
const SWEEP = Math.PI / 3;

/** A page: a book kiosk with a wooden counter, a striped teal awning, a big open book on the counter and its name board on top. */
export class BookStandFactory implements PropFactory {
  readonly key = 'book-stand';

  accepts(a: Activity): boolean {
    return a.modname === 'page';
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const shade = awning(W + 0.3, SHADE_R, 0.07, 7, SWEEP);
    const eave = 0.14 + POST + 0.05;
    const body = new Parts()
      .add(roundedPanel(W + 0.2, 1.5, 0.14, 0.12), C.cream, 0, 0.07, (BACK + FRONT) / 2 + 0.05, 0, Math.PI / 2)
      // Counter: plank front, cream top, a darker kick board.
      .box(W, 0.95, 0.9, C.wood, 0, 0.62, FRONT - 0.45)
      .box(W - 0.1, 0.16, 0.06, C.woodShade, 0, 0.22, FRONT + 0.01)
      .box(W + 0.16, 0.12, 1.06, C.cream, 0, 1.15, FRONT - 0.42)
      .box(W - 0.2, 1.5, 0.12, C.woodShade, 0, 1.0, BACK);
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
      body.add(new CylinderGeometry(0.07, 0.08, POST, 8), C.woodShade, x, 0.14 + POST / 2, BACK);
      body.add(new CylinderGeometry(0.07, 0.08, POST - 0.45, 8), C.woodShade, x, 0.14 + (POST - 0.45) / 2, FRONT + 0.05);
    }
    // The open book: red cover, two cream pages bowed apart, a gold ribbon.
    const book = 1.42;
    body
      .box(1.25, 0.06, 0.82, C.coral, 0, book, FRONT - 0.4, 0, TILT)
      .add(new BoxGeometry(0.58, 0.07, 0.74), C.page, -0.3, book + 0.06, FRONT - 0.38, 0, TILT, 0.1)
      .add(new BoxGeometry(0.58, 0.07, 0.74), C.page, 0.3, book + 0.06, FRONT - 0.38, 0, TILT, -0.1)
      .box(0.05, 0.02, 0.5, C.sun, 0.02, book + 0.14, FRONT - 0.3, 0, TILT)
      // Small stack of books at the counter's end.
      .box(0.5, 0.12, 0.36, C.teal, W / 2 - 0.42, 1.27, FRONT - 0.5, 0.1)
      .box(0.44, 0.12, 0.32, C.sun, W / 2 - 0.42, 1.39, FRONT - 0.5, -0.12)
      .box(0.4, 0.1, 0.3, C.coral, W / 2 - 0.4, 1.5, FRONT - 0.5, 0.05)
      // Striped awning from the back posts' tops down over the counter, a scalloped valance.
      .add(shade.even, C.teal, 0, eave, BACK)
      .add(shade.odd, C.page, 0, eave, BACK)
      .add(scallops(W + 0.3, 7, 0.05), C.teal, 0, eave - SHADE_R * (1 - Math.cos(SWEEP)) - 0.03, BACK + SHADE_R * Math.sin(SWEEP) - 0.03)
      // Name board standing on the awning's ridge.
      .add(roundedPanel(2.9 + 0.22, 1.12, 0.14, 0.14), C.wood, 0, POST + 0.75, BACK - 0.05);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: POST + 0.75, z: BACK + 0.025, w: 0.94 * SIGN_ASPECT, h: 0.94 },
      flag: { x: 1.75, z: BACK, height: 2.2 },
      lock: { x: 0, y: 1.9, z: FRONT + 0.2 },
    });
  }
}
