import { BufferAttribute, CylinderGeometry, RingGeometry, type BufferGeometry } from 'three';
import type { LookPalette } from '../look';
import { Surface, type SurfaceId } from '../surfaces';
import { bakeAo, bowl, facet, lathe } from './shapes';
import type { Landmark } from './landmarks';

const WATER = 0x5fc8d6;
const RIPPLE = 0xa9e6ec;
const FALL = 0xc4f0f2;

/** Radius of the basin's rolled lip: the collision wall stands here. */
export const FOUNTAIN_LIP = 2.45;
/** Radius of the stone step round the basin: the fountain's ground reach. */
export const FOUNTAIN_STEP = 2.9;

/**
 * The spawn plaza's centrepiece (hub concept): a stone step, a round teal basin under a rolled cream lip holding rippled
 * water, a fluted pedestal carrying a wide bowl and a small top bowl, streams falling from each bowl, a jet on top (2.9 m).
 */
export function tieredFountain(p: LookPalette, accent: number): Landmark {
  const stone = (g: BufferGeometry) => surfaced(g, Surface.paving);
  const water = (g: BufferGeometry) => surfaced(g, Surface.plain);
  const parts: BufferGeometry[] = [
    stone(lathe([[FOUNTAIN_STEP, 0], [FOUNTAIN_STEP, 0.12], [FOUNTAIN_STEP - 0.12, 0.2], [2.3, 0.2]], 40, p.trimShade, 0, 0, 0, false)),
    surfaced(lathe([[2.3, 0.2], [2.36, 0.3], [2.36, 0.52], [2.32, 0.56]], 40, accent), Surface.plaster),
    stone(lathe([[2.32, 0.54], [FOUNTAIN_LIP, 0.58], [FOUNTAIN_LIP + 0.02, 0.66], [2.36, 0.74], [2.16, 0.74], [2.06, 0.68]], 40, p.trim)),
    stone(bowl(2.06, 2.04, 0.28, 40, p.trimShade, 0.42)),
    water(facet(new CylinderGeometry(2.05, 2.05, 0.02, 40), WATER, 0, 0.5, 0)),
    water(ring(1.32, 1.42, RIPPLE, 0.515)),
    water(ring(1.78, 1.84, RIPPLE, 0.515)),
    stone(lathe([[0.62, 0.5], [0.56, 0.62], [0.36, 0.74], [0.3, 0.98], [0.38, 1.08], [0.3, 1.18], [0.27, 1.32]], 12, p.trim)),
    surfaced(lathe([[0.27, 1.3], [0.62, 1.36], [0.96, 1.5], [1.1, 1.64]], 24, accent), Surface.plaster),
    stone(lathe([[1.08, 1.62], [1.15, 1.66], [1.14, 1.74], [1.02, 1.76]], 24, p.trim)),
    water(facet(new CylinderGeometry(1.02, 1.02, 0.02, 24), WATER, 0, 1.72, 0)),
    stone(lathe([[0.2, 1.72], [0.24, 1.86], [0.15, 2.06], [0.19, 2.16]], 10, p.trim)),
    stone(lathe([[0.17, 2.14], [0.42, 2.2], [0.6, 2.32], [0.66, 2.42], [0.6, 2.46]], 16, p.trim)),
    water(facet(new CylinderGeometry(0.58, 0.58, 0.02, 16), WATER, 0, 2.42, 0)),
    water(lathe([[0.13, 2.4], [0.12, 2.62], [0.07, 2.84], [0, 2.92]], 8, FALL)),
  ];
  // Streams: eight from the wide bowl's lip into the basin, six from the top bowl into the wide one.
  for (let i = 0; i < 8; i++) parts.push(water(lathe([[1.16, 1.68], [1.24, 1.42], [1.3, 1.0], [1.33, 0.52]], 2, FALL, 0, 0, 0, true, (i / 8) * Math.PI * 2, 0.2)));
  for (let i = 0; i < 6; i++) parts.push(water(lathe([[0.67, 2.42], [0.74, 2.2], [0.78, 1.96], [0.8, 1.74]], 2, FALL, 0, 0, 0, true, (i / 6) * Math.PI * 2 + 0.3, 0.28)));
  for (const g of parts) bakeAo(g, 0.2, 0.5, 0.22);
  return { parts, glow: [], height: 2.92, radius: FOUNTAIN_STEP, flag: null };
}

/** A flat ring facing up at height y. */
function ring(r0: number, r1: number, colour: number, y: number): BufferGeometry {
  return facet(new RingGeometry(r0, r1, 32).rotateX(-Math.PI / 2), colour, 0, y, 0);
}

/** Tags every vertex with one atlas surface. */
function surfaced(g: BufferGeometry, surface: SurfaceId): BufferGeometry {
  g.setAttribute('surface', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(surface), 1));
  return g;
}
