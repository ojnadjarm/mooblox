import { BODY, box, mirrored, shade, type Part } from './parts';
import { CLOTH } from './catalog';

const HAND_TOP = 0.96;
const SLEEVE_SHORT = 1.5;
const SHORTS_HEM = 0.6;
const SHOE_TOP: Readonly<Record<string, number>> = { sneakers: 0.16, boots: 0.34, sandals: 0.06 };

/** Head, torso and arms for a top style. */
export function upperBody(top: string, topColour: number, skin: number): Part[] {
  const t = BODY.torso;
  const torso: Part[] =
    top === 'stripes'
      ? [0, 1, 2, 3].map((i) => box('torso', t.min[0], t.max[0], 1.0 + i * 0.225, 1.225 + i * 0.225, t.min[2], t.max[2], i % 2 ? shade(topColour, 1.6) : topColour))
      : [box('torso', t.min[0], t.max[0], t.min[1], t.max[1], t.min[2], t.max[2], topColour)];
  if (top === 'hoodie') {
    torso.push(box('torso', -0.24, 0.24, 1.08, 1.34, 0.3, 0.33, shade(topColour, 0.8)));
    torso.push(...mirrored((s) => [box('torso', s * 0.1 - 0.015, s * 0.1 + 0.015, 1.6, 1.86, 0.3, 0.32, CLOTH['white']!)]));
  }
  const sleeveFrom = top === 'tank' ? t.max[1] : top === 'longsleeve' || top === 'hoodie' ? HAND_TOP : SLEEVE_SHORT;
  const arms = mirrored((s) => {
    const a = s > 0 ? BODY.armLeft : BODY.armRight;
    const bone = s > 0 ? 'arm-left' : 'arm-right';
    const out: Part[] = [box(bone, a.min[0], a.max[0], a.min[1], HAND_TOP, a.min[2], a.max[2], skin)];
    if (sleeveFrom > HAND_TOP) out.push(box(bone, a.min[0], a.max[0], HAND_TOP, sleeveFrom, a.min[2], a.max[2], skin));
    if (sleeveFrom < a.max[1]) out.push(box(bone, a.min[0], a.max[0], sleeveFrom, a.max[1], a.min[2], a.max[2], top === 'stripes' ? shade(topColour, 1.6) : topColour));
    return out;
  });
  const h = BODY.head;
  return [box('head', h.min[0], h.max[0], h.min[1], h.max[1], h.min[2], h.max[2], skin), ...torso, ...arms];
}

/** Legs, shoes and the skirt. */
export function lowerBody(bottom: string, bottomColour: number, shoes: string, shoeColour: number, skin: number): Part[] {
  const shoeTop = SHOE_TOP[shoes] ?? 0.16;
  const sole = shoeColour === CLOTH['white'] ? CLOTH['grey']! : CLOTH['white']!;
  const legs = mirrored((s) => {
    const l = s > 0 ? BODY.legLeft : BODY.legRight;
    const bone = s > 0 ? 'leg-left' : 'leg-right';
    const x0 = l.min[0] - 0.015;
    const x1 = l.max[0] + 0.015;
    const out: Part[] = [];
    if (shoes === 'sandals') {
      out.push(box(bone, x0, x1, 0, shoeTop, -0.215, 0.24, shoeColour));
      out.push(box(bone, l.min[0] - 0.005, l.max[0] + 0.005, shoeTop, 0.13, 0.04, 0.21, shoeColour));
    } else {
      out.push(box(bone, x0, x1, 0, 0.04, -0.215, 0.25, sole));
      out.push(box(bone, x0, x1, 0.04, shoeTop, -0.215, 0.25, shoeColour));
    }
    const hem = bottom === 'trousers' ? shoeTop : bottom === 'shorts' ? SHORTS_HEM : 1.0;
    if (hem > shoeTop) out.push(box(bone, l.min[0], l.max[0], shoeTop, hem, l.min[2], l.max[2], skin));
    if (hem < 1.0) out.push(box(bone, l.min[0], l.max[0], hem, 1.0, l.min[2], l.max[2], bottomColour));
    return out;
  });
  if (bottom === 'skirt') {
    legs.push(box('root', -0.42, 0.42, 0.86, 1.06, -0.33, 0.33, bottomColour));
    legs.push(box('root', -0.46, 0.46, 0.68, 0.86, -0.38, 0.38, shade(bottomColour, 0.92)));
  }
  return legs;
}
