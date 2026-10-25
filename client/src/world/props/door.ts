import { SphereGeometry } from 'three';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { hipRoof } from '../landmarks/shapes';
import { Palette, PurposeColor } from '../palette';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import { archPanel, PropColour as C, roundedPanel, voussoirs } from './prop-shapes';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const BACK = -0.5;
const GLOW = 0xfff1c4;
/** Leaf width and the jambs' height (the arch springs there). */
const LEAF = 1.74;
const SPRING = 2.25;

/** Fallback for any activity: an arched stone doorway with a round-topped door in the module's purpose colour, its name board under a little roof. */
export class DoorFactory implements PropFactory {
  readonly key = 'door';

  accepts(): boolean {
    return true;
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const colour = PurposeColor[a.purpose] ?? Palette.pink;
    const r = LEAF / 2;
    const top = SPRING + r + 0.42;
    const body = new Parts()
      .add(roundedPanel(2.9, 1.1, 0.16, 0.14), C.rockShade, 0, 0.08, BACK + 0.2, 0, Math.PI / 2)
      .box(0.42, SPRING - 0.16, 0.56, C.cream, -r - 0.21, 0.16 + (SPRING - 0.16) / 2, BACK)
      .box(0.42, SPRING - 0.16, 0.56, C.cream, r + 0.21, 0.16 + (SPRING - 0.16) / 2, BACK)
      .add(archPanel(LEAF, SPRING - 0.16 + r, 0.04), GLOW, 0, 0.16, BACK - 0.16);
    const arch = voussoirs(r, r + 0.42, 0.56, 7);
    arch.forEach((g, i) => body.add(g, i === arch.length - 1 ? C.sun : C.cream, 0, SPRING, BACK));
    body
      .add(roundedPanel(3.06, 1.14, 0.14, 0.14), C.wood, 0, top + 0.5, BACK)
      .add(hipRoof(3.3, 0.7, 0.5, colour), null, 0, top + 1.05, BACK);
    // The leaf hangs on its left jamb (local +x runs along it); an open door shows warm light inside the frame.
    const leaf = (): Parts =>
      new Parts()
        .add(archPanel(LEAF, SPRING - 0.16 + r, 0.18), colour, r, 0.16, 0)
        .add(roundedPanel(0.62, 0.62, 0.06, 0.31, 0.02), C.cream, r, SPRING - 0.1, 0.1)
        .box(1.3, 0.08, 0.04, C.woodShade, r, 1.0, 0.1)
        .add(new SphereGeometry(0.09, 8, 6), C.sun, LEAF - 0.24, 1.3, 0.14);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: top + 0.5, z: BACK + 0.075, w: 0.96 * SIGN_ASPECT, h: 0.96 },
      flag: { x: 1.75, z: BACK, height: 2.9 },
      lock: { x: 0, y: 1.55, z: BACK + 0.3 },
      leaf: { build: leaf, x: -r, z: BACK },
    });
  }
}
