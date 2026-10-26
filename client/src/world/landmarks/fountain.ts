import { BufferAttribute, CircleGeometry, RingGeometry, type BufferGeometry } from 'three';
import type { LookPalette } from '../look';
import { Surface, type SurfaceId } from '../surfaces';
import { rippleCode, splashCode, streamCode } from '../water-motion';
import { bakeAo, bowl, facet, lathe } from './shapes';
import type { Landmark } from './landmarks';

const WATER = 0x5fc8d6;
const FALL = 0xc4f0f2;

/** Where the wide bowl's and the top bowl's streams land (their ripples start there). */
const BIG_FALL = 1.33;
const SMALL_FALL = 0.8;

/** Radius of the basin's rolled lip: the collision wall stands here. */
export const FOUNTAIN_LIP = 2.45;
/** Radius of the stone step round the basin: the fountain's ground reach. */
export const FOUNTAIN_STEP = 2.9;

/**
 * The spawn plaza's centrepiece (hub concept): a stone step, a round teal basin under a rolled cream lip holding rippled
 * water, a fluted pedestal carrying a wide bowl and a small top bowl, streams falling from each bowl into splashes, a jet on top (2.9 m);
 * the water is coded to move in the scenery shader (`water-motion.ts`).
 */
export function tieredFountain(p: LookPalette, accent: number): Landmark {
  const stone = (g: BufferGeometry) => surfaced(g, Surface.paving);
  const water = (g: BufferGeometry) => surfaced(g, Surface.plain);
  const parts: BufferGeometry[] = [
    stone(lathe([[FOUNTAIN_STEP, 0], [FOUNTAIN_STEP, 0.12], [FOUNTAIN_STEP - 0.12, 0.2], [2.3, 0.2]], 40, p.trimShade, 0, 0, 0, false)),
    surfaced(lathe([[2.3, 0.2], [2.36, 0.3], [2.36, 0.52], [2.32, 0.56]], 40, accent), Surface.plaster),
    stone(lathe([[2.32, 0.54], [FOUNTAIN_LIP, 0.58], [FOUNTAIN_LIP + 0.02, 0.66], [2.36, 0.74], [2.16, 0.74], [2.06, 0.68]], 40, p.trim)),
    stone(bowl(2.06, 2.04, 0.28, 40, p.trimShade, 0.42)),
    ...pool(2.05, BIG_FALL, 0.51, 40),
    stone(lathe([[0.62, 0.5], [0.56, 0.62], [0.36, 0.74], [0.3, 0.98], [0.38, 1.08], [0.3, 1.18], [0.27, 1.32]], 12, p.trim)),
    surfaced(lathe([[0.27, 1.3], [0.62, 1.36], [0.96, 1.5], [1.1, 1.64]], 24, accent), Surface.plaster),
    stone(lathe([[1.08, 1.62], [1.15, 1.66], [1.14, 1.74], [1.02, 1.76]], 24, p.trim)),
    ...pool(1.02, SMALL_FALL, 1.73, 24),
    stone(lathe([[0.2, 1.72], [0.24, 1.86], [0.15, 2.06], [0.19, 2.16]], 10, p.trim)),
    stone(lathe([[0.17, 2.14], [0.42, 2.2], [0.6, 2.32], [0.66, 2.42], [0.6, 2.46]], 16, p.trim)),
    ...pool(0.58, 0.13, 2.43, 16),
    streamCode(water(lathe([[0.13, 2.4], [0.12, 2.62], [0.07, 2.84], [0, 2.92]], 8, FALL)), 2.4, 2.92),
  ];
  // Streams: eight from the wide bowl's lip into the basin, six from the top bowl into the wide one, each landing in a splash.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(streamCode(water(lathe([[1.16, 1.68], [1.24, 1.42], [1.3, 1.0], [BIG_FALL, 0.52]], 2, FALL, 0, 0, 0, true, a, 0.2)), 1.68, 0.52));
    parts.push(splash(BIG_FALL, a + 0.1, 0.51));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    parts.push(streamCode(water(lathe([[0.67, 2.42], [0.74, 2.2], [0.78, 1.96], [SMALL_FALL, 1.74]], 2, FALL, 0, 0, 0, true, a, 0.28)), 2.42, 1.74));
    parts.push(splash(SMALL_FALL, a + 0.14, 1.73));
  }
  for (const g of parts) bakeAo(g, 0.2, 0.5, 0.22);
  return { parts, glow: [], height: 2.92, radius: FOUNTAIN_STEP, flag: null };
}

/** Flat water of radius r at height y: a fan to the ring where the streams land and a band outside it, coded to ripple out from that ring. */
function pool(r: number, from: number, y: number, sides: number): BufferGeometry[] {
  const inner = new CircleGeometry(from, sides).rotateX(-Math.PI / 2);
  const outer = new RingGeometry(from, r, sides, 1).rotateX(-Math.PI / 2);
  return [inner, outer].map((g) => rippleCode(surfaced(facet(g, WATER, 0, y, 0), Surface.plain), 0, 0, from));
}

/** A low foam mound where a stream lands, at radius r and angle a; it bobs in the shader. */
function splash(r: number, a: number, y: number): BufferGeometry {
  const g = lathe([[0.16, 0], [0.09, 0.08], [0, 0.12]], 5, FALL, 0, 0, 0, true);
  g.translate(Math.sin(a) * r, y, Math.cos(a) * r);
  return splashCode(surfaced(g, Surface.plain), y, y + 0.12);
}

/** Tags every vertex with one atlas surface. */
function surfaced(g: BufferGeometry, surface: SurfaceId): BufferGeometry {
  g.setAttribute('surface', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(surface), 1));
  return g;
}
