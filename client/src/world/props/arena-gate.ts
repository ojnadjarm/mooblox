import { OctahedronGeometry, SphereGeometry } from 'three';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { ActivityProp } from './activity-prop';
import { Parts } from './parts';
import { banner, PropColour as C, roundedPanel, voussoirs } from './prop-shapes';
import type { Prop, PropContext, PropFactory } from './prop';
import { SIGN_ASPECT } from './sign-painter';

const BACK = -0.4;
const RED = 0xe5484d;
/** Half the opening, the spring line and the arch ring's outer radius. */
const OPEN = 0.95;
const SPRING = 2.3;
const RING = 1.5;

/** A quiz: a cut-stone arena arch over an iron gate, red banners on its piers, a name board and a gold gem on top. */
export class ArenaGateFactory implements PropFactory {
  readonly key = 'arena-gate';

  accepts(a: Activity): boolean {
    return a.modname === 'quiz';
  }

  create(a: Activity, plot: Plot, ctx: PropContext): Prop {
    const pier = RING - OPEN;
    const px = OPEN + pier / 2;
    const body = new Parts().add(roundedPanel(2 * (RING + 0.35), 1.5, 0.14, 0.14), C.rockShade, 0, 0.07, BACK, 0, Math.PI / 2);
    for (const side of [-1, 1]) {
      const x = side * px;
      body
        .box(pier + 0.2, 0.3, 1.1, C.creamShade, x, 0.29, BACK)
        .box(pier, SPRING - 0.44, 0.9, C.cream, x, 0.44 + (SPRING - 0.44) / 2, BACK)
        .box(pier + 0.12, 0.16, 1.0, C.creamShade, x, SPRING - 0.02, BACK)
        .add(banner(0.42, 1.15, 0.04), RED, x, SPRING - 0.25, BACK + 0.47)
        .add(new SphereGeometry(0.09, 8, 6), C.sun, x, SPRING - 0.75, BACK + 0.5);
    }
    const arch = voussoirs(OPEN, RING, 0.9, 9);
    arch.forEach((g, i) => body.add(g, i === arch.length - 1 ? C.sun : C.cream, 0, SPRING, BACK));
    // Iron gate in the opening: bars up to the arch, two rails.
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.34;
      const h = SPRING + Math.sqrt(OPEN * OPEN - x * x) - 0.32;
      body.box(0.07, h, 0.07, C.iron, x, 0.14 + h / 2, BACK);
    }
    body
      .box(2 * OPEN, 0.09, 0.08, C.iron, 0, 0.6, BACK)
      .box(2 * OPEN, 0.09, 0.08, C.iron, 0, 1.75, BACK)
      // Name board on the arch, the prize gem over it.
      .add(roundedPanel(3.1, 1.12, 0.16, 0.14), RED, 0, SPRING + RING + 0.5, BACK)
      .add(new OctahedronGeometry(0.3), C.sun, 0, SPRING + RING + 1.4, BACK);
    return new ActivityProp(this.key, a, plot, ctx, {
      body,
      sign: { x: 0, y: SPRING + RING + 0.5, z: BACK + 0.085, w: 0.92 * SIGN_ASPECT, h: 0.92 },
      flag: { x: RING + 0.55, z: BACK, height: 3.2 },
      lock: { x: 0, y: 1.3, z: BACK + 0.25 },
    });
  }
}
