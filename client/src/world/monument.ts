import { BufferGeometry, ConeGeometry, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { collectibleGeometry } from './collectible-models';
import type { HallSite } from './dressing';
import { alternate, bakeAo, facet, prism } from './landmarks/shapes';

/** Art data (art bible section 4): cream trim, teal hub accent, sunflower gold, pale unlit lanterns. */
const ART = {
  trim: 0xf4e6cc,
  trimShade: 0xd2bc9a,
  teal: 0x2fa39a,
  tealShade: 0x1f7a78,
  gold: 0xf6c445,
  goldShade: 0xd49a2a,
  unlit: 0xd9c3a5,
} as const;

/** Lanterns round the plinth: one share of the class goal each. */
export const MONUMENT_LAMPS = 10;
const LAMP_RING = 0.86;
const LAMP_Y = 0.46;
const STAR_Y = 3.95;

/** A ring of gold rays round the star (the goal reached), facing +z. */
function sunburst(y: number): BufferGeometry[] {
  return Array.from({ length: 12 }, (_, i) =>
    facet(new ConeGeometry(0.1, 0.5, 4).translate(0, 0.97, 0).rotateZ((i / 12) * Math.PI * 2), i % 2 ? ART.goldShade : ART.gold, 0, y, 0),
  );
}

/** One lantern on the plinth: a trim foot, a six-sided glass in its colour and a trim cap. */
const lamp = (i: number, colour: number): BufferGeometry[] => {
  const a = (i / MONUMENT_LAMPS) * Math.PI * 2;
  const [x, z] = [Math.sin(a) * LAMP_RING, Math.cos(a) * LAMP_RING];
  return [
    prism(0.1, 0.12, 0.06, 6, ART.trimShade, x, LAMP_Y, z),
    prism(0.1, 0.09, 0.2, 6, colour, x, LAMP_Y + 0.06, z),
    prism(0.02, 0.12, 0.08, 6, ART.trim, x, LAMP_Y + 0.26, z),
  ];
};

/**
 * The class goal monument on its site in world space (one vertex-coloured geometry): a stepped octagonal plinth, a tapered
 * teal column with gold bands and a gold star on top, ringed by lanterns. `lit` lanterns turn gold (the shared progress);
 * when `reached`, every lantern is gold and a sunburst rings the star.
 */
export function monumentGeometry(site: HallSite, lit: number, reached: boolean): BufferGeometry {
  const solid: BufferGeometry[] = [
    bakeAo(alternate(prism(1.3, 1.38, 0.22, 8, ART.trimShade), ART.trim, 1), 0, 0.2, 0.3),
    alternate(prism(1.02, 1.08, 0.24, 8, ART.trim, 0, 0.22), ART.trimShade, 1),
    alternate(prism(0.5, 0.56, 0.14, 8, ART.gold, 0, 0.46), ART.goldShade, 1),
    alternate(prism(0.3, 0.42, 2.5, 8, ART.teal, 0, 0.6), ART.tealShade, 1),
    alternate(prism(0.36, 0.34, 0.12, 8, ART.gold, 0, 1.9), ART.goldShade, 1),
    alternate(prism(0.52, 0.34, 0.26, 8, ART.gold, 0, 3.1), ART.goldShade, 1),
    alternate(prism(0.18, 0.5, 0.16, 8, ART.trim, 0, 3.36), ART.trimShade, 1),
  ];
  for (let i = 0; i < MONUMENT_LAMPS; i++) solid.push(...lamp(i, reached || i < lit ? ART.gold : ART.unlit));
  solid.push(collectibleGeometry('star').scale(1.6, 1.6, 1.6).translate(0, STAR_Y, 0));
  if (reached) solid.push(...sunburst(STAR_Y));
  return mergeGeometries(solid)!.applyMatrix4(new Matrix4().makeRotationY(site.face).setPosition(site.x, 0, site.z));
}
