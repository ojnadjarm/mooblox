import { CylinderGeometry, type BufferGeometry } from 'three';
import type { LookPalette } from './look';
import { sealParts } from './model-seal';
import { bakeAo, cone, facet, prism } from './landmarks/shapes';
import type { Recipe } from './recipes';

/**
 * Destinations at the head of a shelf stair (art data): a lookout bench pair or a picnic spot (kit props), a telescope or a small
 * gazebo (built: no kit model fits). Local frame: +z faces the sea, y 0 = the shelf top.
 */

/** A destination: a kit recipe, or built solid parts reaching `reach` round their centre and `top` high. */
export type Lookout =
  | { readonly kind: 'benches' | 'picnic'; readonly recipe: Recipe }
  | { readonly kind: 'telescope' | 'gazebo'; readonly parts: (p: LookPalette, accent: number) => BufferGeometry[]; readonly reach: number; readonly top: number };

const LEAF = 0xc8eaa0;
const BRASS = 0xd9a441;
const SEAL = 0.012;
/** Gazebo posts stand this high: the kid (2.6 m capsule) walks in under the beam. */
const GAZEBO_POST = 3;
/** The telescope tube's tilt above the horizon (rad). */
const AIM = 0.3;

const BENCHES: Lookout = {
  kind: 'benches',
  recipe: {
    items: [
      { id: 'town/stall-bench', dx: -1, dz: 0, height: 0.42, yaw: Math.PI / 2, solid: true },
      { id: 'town/stall-bench', dx: 1, dz: 0, height: 0.42, yaw: Math.PI / 2, solid: true },
      { id: 'nature/plant_bushDetailed', dx: -1.2, dz: -0.8, height: 0.5, sway: true, detail: true, tint: LEAF },
      { id: 'nature/plant_bushDetailed', dx: 1.2, dz: -0.8, height: 0.5, sway: true, detail: true, tint: LEAF },
    ],
    radius: 1.9,
  },
};

const PICNIC: Lookout = {
  kind: 'picnic',
  recipe: {
    items: [
      { id: 'pirate/crate', dx: 0, dz: 0, height: 0.5, yaw: 0, solid: true, detail: true },
      { id: 'town/stall-stool', dx: 0.7, dz: 0, height: 0.34, yaw: 0, solid: true, detail: true },
      { id: 'town/stall-stool', dx: -0.7, dz: 0, height: 0.34, yaw: 0, solid: true, detail: true },
      { id: 'pirate/barrel', dx: 0, dz: -0.95, height: 0.6, yaw: 0, solid: true, detail: true },
    ],
    radius: 1.35,
  },
};

/** A tilted cylinder along +z (raised by AIM) centred at (0, y, z). */
const tube = (r0: number, r1: number, len: number, colour: number, y: number, z: number): BufferGeometry =>
  facet(new CylinderGeometry(r0, r1, len, 10).rotateX(Math.PI / 2 - AIM), colour, 0, y, z);

/** A brass telescope on a wooden tripod over a round stone step, aimed out to sea. */
function telescope(p: LookPalette, accent: number): BufferGeometry[] {
  const parts = [prism(0.5, 0.55, 0.14, 10, p.trimShade)];
  for (let k = 0; k < 3; k++) {
    const leg = new CylinderGeometry(0.03, 0.04, 1.19, 5).rotateZ(0.255).translate(0.15, 0.575, 0).rotateY((k / 3) * Math.PI * 2 + Math.PI / 6);
    parts.push(facet(leg, p.woodDark, 0, 0.14, 0));
  }
  parts.push(tube(0.09, 0.12, 1.1, BRASS, 1.38, 0.15));
  parts.push(tube(0.05, 0.05, 0.22, p.woodDark, 1.18, -0.47));
  parts.push(tube(0.135, 0.135, 0.08, accent, 1.53, 0.66));
  return parts;
}

/** A small round gazebo: stone floor, six wooden posts, a beam ring and a pointed roof in the district accent. */
function gazebo(p: LookPalette, accent: number): BufferGeometry[] {
  const parts = [prism(1.5, 1.55, 0.12, 12, p.trim)];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(prism(0.08, 0.09, GAZEBO_POST, 6, p.wood, Math.sin(a) * 1.3, 0.12, Math.cos(a) * 1.3));
  }
  parts.push(prism(1.48, 1.48, 0.16, 12, p.woodDark, 0, 0.12 + GAZEBO_POST));
  parts.push(cone(1.85, 1.1, 12, accent, 0, 0.28 + GAZEBO_POST));
  parts.push(prism(0.05, 0.08, 0.35, 6, p.trimShade, 0, 1.38 + GAZEBO_POST));
  return parts;
}

const TELESCOPE: Lookout = { kind: 'telescope', parts: telescope, reach: 0.85, top: 1.7 };
const GAZEBO: Lookout = { kind: 'gazebo', parts: gazebo, reach: 1.9, top: 1.75 + GAZEBO_POST };

/** Ground reach of a destination round its centre. */
export const lookoutReach = (l: Lookout): number => ('recipe' in l ? l.recipe.radius : l.reach);

/** Every destination in a seeded order: the designer takes the first that fits. */
export function lookouts(random: () => number): Lookout[] {
  return [BENCHES, PICNIC, TELESCOPE, GAZEBO].map((l) => ({ l, k: random() })).sort((a, b) => a.k - b.k).map((x) => x.l);
}

/** A built destination's parts in its local frame, sealed against shared planes and shaded at the foot. */
export function lookoutParts(l: Extract<Lookout, { parts: unknown }>, p: LookPalette, accent: number): BufferGeometry[] {
  const parts = l.parts(p, accent);
  sealParts(parts, SEAL);
  for (const g of parts) bakeAo(g, 0, 1, 0.25);
  return parts;
}
