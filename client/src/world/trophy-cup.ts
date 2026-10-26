import { BufferAttribute, Color, CylinderGeometry, Matrix4, TorusGeometry, type BufferGeometry } from 'three';
import { collectibleGeometry } from './collectible-models';
import { alternate, lathe, prism } from './landmarks/shapes';

/** Trophy metals, lit and shade (catalog trophy styles; colour only, never a rank). */
export const METALS = {
  gold: [0xf6c445, 0xc98a1e],
  silver: [0xe6ebf3, 0x98a3b8],
  bronze: [0xe39a63, 0x9c5530],
} as const;
export type Metal = keyof typeof METALS;

/** Where the badge medallion sits on a trophy (local, facing +z): centre height, depth and radius. */
export interface MedalSpot {
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

/** One trophy standing on y = 0 and facing +z: its parts (vertex colours, `shine` 1 on metal) and its medallion spot. */
export interface TrophyModel {
  readonly parts: readonly BufferGeometry[];
  readonly medal: MedalSpot;
}

/** Sides of every round trophy part (low-poly, smooth-shaded so the shine rolls over it). */
const SIDES = 10;

/** Marks a geometry as metal (1) or not (0) for the shine pass. */
export function shine(g: BufferGeometry, value: number): BufferGeometry {
  g.setAttribute('shine', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(value), 1));
  return g;
}

function paint(g: BufferGeometry, colour: number): BufferGeometry {
  const c = new Color(colour);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

/** A smooth metal piece from any three geometry, moved by `m`. */
function piece(g: BufferGeometry, colour: number, m: Matrix4): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  flat.deleteAttribute('uv');
  flat.applyMatrix4(m);
  return shine(paint(flat, colour), 1);
}

/** A C-shaped handle on the side `side` (+1 right, -1 left) of a bowl: a half ring standing in the xy plane. */
function handle(side: 1 | -1, x: number, y: number, r: number, colour: number): BufferGeometry {
  const ring = new TorusGeometry(r, 0.028, 4, 6, Math.PI);
  return piece(ring, colour, new Matrix4().makeRotationZ(side > 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(x, y, 0));
}

/** The medallion's metal frame: a short disc behind the badge face. */
function frame(spot: MedalSpot, colour: number): BufferGeometry {
  const disc = new CylinderGeometry(spot.r + 0.035, spot.r + 0.035, 0.05, 12);
  return piece(disc, colour, new Matrix4().makeRotationX(Math.PI / 2).setPosition(0, spot.y, spot.z - 0.026));
}

const metal = (g: BufferGeometry): BufferGeometry => shine(g, 1);

/** A stepped round foot and stem with a knop, `stem` high. */
function foot(lit: number, shade: number, stem: number): BufferGeometry[] {
  return [
    metal(lathe([[0.001, 0], [0.21, 0], [0.21, 0.045], [0.16, 0.075], [0.12, 0.1]], SIDES, shade)),
    metal(lathe([[0.12, 0.1], [0.055, 0.14], [0.045, 0.1 + stem * 0.45], [0.085, 0.1 + stem * 0.6], [0.045, 0.1 + stem * 0.8], [0.07, 0.1 + stem]], SIDES, lit)),
  ];
}

/** Gold: a wide two-handled loving cup with a rolled lip. */
function lovingCup(): TrophyModel {
  const [lit, shade] = METALS.gold;
  const b = 0.32;
  const spot = { y: b + 0.27, z: 0.315, r: 0.18 };
  return {
    parts: [
      ...foot(lit, shade, 0.22),
      metal(lathe([[0.07, b], [0.2, b + 0.06], [0.27, b + 0.16], [0.295, b + 0.3], [0.3, b + 0.42], [0.335, b + 0.45], [0.31, b + 0.47], [0.27, b + 0.43], [0.24, b + 0.3]], SIDES, lit)),
      handle(1, 0.27, b + 0.26, 0.13, shade),
      handle(-1, -0.27, b + 0.26, 0.13, shade),
      frame(spot, shade),
    ],
    medal: spot,
  };
}

/** Silver: a tall lidded goblet with small handles and a ball finial. */
function goblet(): TrophyModel {
  const [lit, shade] = METALS.silver;
  const b = 0.38;
  const spot = { y: b + 0.24, z: 0.27, r: 0.17 };
  return {
    parts: [
      ...foot(lit, shade, 0.28),
      metal(lathe([[0.07, b], [0.17, b + 0.05], [0.235, b + 0.16], [0.255, b + 0.3], [0.25, b + 0.42], [0.275, b + 0.44]], SIDES, lit)),
      metal(lathe([[0.275, b + 0.44], [0.25, b + 0.5], [0.15, b + 0.56], [0.06, b + 0.6], [0.075, b + 0.66], [0.001, b + 0.72]], SIDES, shade)),
      handle(1, 0.23, b + 0.26, 0.1, shade),
      handle(-1, -0.23, b + 0.26, 0.1, shade),
      frame(spot, shade),
    ],
    medal: spot,
  };
}

/** Bronze: a star statue on a fluted column holding the medallion at its heart. */
function starStatue(): TrophyModel {
  const [lit, shade] = METALS.bronze;
  const spot = { y: 0.74, z: 0.13, r: 0.17 };
  const star = collectibleGeometry('star').applyMatrix4(new Matrix4().makeScale(0.82, 0.82, 0.82).setPosition(0, spot.y, 0));
  return {
    parts: [
      ...foot(lit, shade, 0.2),
      metal(alternate(prism(0.07, 0.09, 0.3, 6, shade, 0, 0.3), lit, 2)),
      metal(alternate(paint(star, lit), shade, 1)),
      frame(spot, shade),
    ],
    medal: spot,
  };
}

const DESIGNS: Readonly<Record<Metal, () => TrophyModel>> = { gold: lovingCup, silver: goblet, bronze: starStatue };

/** The trophy of a metal: gold loving cup, silver goblet, bronze star statue. */
export const trophyModel = (m: Metal): TrophyModel => DESIGNS[m]();
