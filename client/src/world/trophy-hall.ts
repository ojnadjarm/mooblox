import { BufferAttribute, BufferGeometry, CircleGeometry, CylinderGeometry, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { collectibleGeometry } from './collectible-models';
import type { HallSite } from './dressing';
import { alternate, bakeAo, box, facet, prism } from './landmarks/shapes';

/** Art data (art bible section 4): cream trim and walls, terracotta floor, teal hub accent, three pedestal metals. */
const ART = {
  trim: 0xf4e6cc,
  trimShade: 0xd2bc9a,
  floor: 0xe0844f,
  floorShade: 0xb4583a,
  wall: 0xf6ead3,
  wallShade: 0xd9c3a5,
  teal: 0x2fa39a,
  tealShade: 0x1f7a78,
  ink: 0x2b2f3a,
} as const;

/** Pedestal metals, lit and shade (catalog trophy styles; colour only, never a rank). */
export const METALS = {
  gold: [0xf6c445, 0xd49a2a],
  silver: [0xdfe4ee, 0xa7b0c2],
  bronze: [0xe09a6a, 0xa85f3a],
} as const;
export type Metal = keyof typeof METALS;
const METAL_ORDER: readonly Metal[] = ['gold', 'silver', 'bronze'];

/** The pedestal style of a badge (stable per badge). */
export const metalOf = (badgeId: number): Metal => METAL_ORDER[Math.abs(badgeId) % 3]!;

const DAIS_H = 0.34;
const COLUMN_H = 2.7;
/** Pedestal spacing along the horseshoe, metres. */
const PITCH = 1.15;
/** The horseshoe of pedestals opens towards the front over this many radians. */
const SPAN = (220 * Math.PI) / 180;
/** Height of a medallion's centre above the dais. */
const MEDAL_Y = 1.3;
const MEDAL_R = 0.3;

/** One pedestal: where it stands on the dais (local, open side +z) and the yaw its medallion faces. */
export interface PedestalSlot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/** Pedestals that fit the horseshoe of a hall of radius r. */
export const hallCapacity = (r: number): number => Math.floor(((r - 1.05) * SPAN) / PITCH) + 1;

/** Pedestal slots for `count` trophies (at least one, the empty "?" pedestal), centred on the back of the horseshoe. */
export function pedestalSlots(count: number, r: number): PedestalSlot[] {
  const n = Math.max(1, Math.min(count, hallCapacity(r)));
  const ring = r - 1.05;
  const step = PITCH / ring;
  return Array.from({ length: n }, (_, i) => {
    const t = (i - (n - 1) / 2) * step;
    const x = Math.sin(t) * ring;
    const z = -Math.cos(t) * ring;
    return { x, z, yaw: Math.atan2(-x, -z) };
  });
}

/** Atlas rectangle (uv 0..1, v up) of one cell's medallion and name strip. */
export interface AtlasCell {
  readonly medal: readonly [number, number, number, number];
  readonly name: readonly [number, number, number, number];
}

/** The hall in world space: one geometry, vertex colours times the atlas (architecture samples a white texel). */
export interface HallGeometry {
  readonly geometry: BufferGeometry;
  readonly slots: readonly PedestalSlot[];
}

const at = (g: BufferGeometry, x: number, y: number, z: number, yaw = 0): BufferGeometry => g.applyMatrix4(new Matrix4().makeRotationY(yaw).setPosition(x, y, z));

/** Gives a geometry one colour or one uv everywhere so the two kinds merge. */
function fill(g: BufferGeometry, name: 'color' | 'uv', value: readonly number[]): BufferGeometry {
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * value.length);
  for (let i = 0; i < n; i++) data.set(value, i * value.length);
  g.setAttribute(name, new BufferAttribute(data, value.length));
  return g;
}
/** The open round pavilion: a stepped dais with radial paving and a back colonnade under a teal lintel with a gold star. */
function pavilion(r: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  parts.push(bakeAo(prism(r, r + 0.12, 0.18, 24, ART.trim), 0, 0.12, 0.35));
  parts.push(alternate(prism(r - 0.32, r - 0.32, 0.16, 24, ART.floor, 0, 0.18), ART.floorShade, 1));
  const ring = r - 0.3;
  const cols = 5;
  const back = (160 * Math.PI) / 180;
  const tops: [number, number][] = [];
  for (let i = 0; i < cols; i++) {
    const t = (i / (cols - 1) - 0.5) * back;
    const x = Math.sin(t) * ring;
    const z = -Math.cos(t) * ring;
    tops.push([x, z]);
    parts.push(box(0.44, 0.14, 0.44, ART.trim, x, DAIS_H, z));
    parts.push(alternate(prism(0.15, 0.17, COLUMN_H - 0.28, 8, ART.wall, x, DAIS_H + 0.14, z), ART.wallShade, 2));
    parts.push(box(0.46, 0.14, 0.46, ART.trim, x, DAIS_H + COLUMN_H - 0.14, z));
  }
  for (let i = 0; i + 1 < tops.length; i++) {
    const [ax, az] = tops[i]!;
    const [bx, bz] = tops[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az) + 0.42;
    const yaw = Math.atan2(-(bz - az), bx - ax);
    parts.push(at(box(len + 0.04, 0.1, 0.4, ART.tealShade), (ax + bx) / 2, DAIS_H + COLUMN_H, (az + bz) / 2, yaw));
    parts.push(at(box(len, 0.32, 0.34, ART.teal), (ax + bx) / 2, DAIS_H + COLUMN_H + 0.1, (az + bz) / 2, yaw));
  }
  const crest = collectibleGeometry('star').scale(1.3, 1.3, 1.3);
  parts.push(at(crest, 0, DAIS_H + COLUMN_H + 0.95, -ring, 0));
  return parts;
}

/** A faceted octagonal plinth in its metal with a trim base and cap, and the medallion frame on top (local, facing +z). */
function pedestal(metal: Metal): BufferGeometry[] {
  const [lit, shade] = METALS[metal];
  const frame = facet(new CylinderGeometry(MEDAL_R + 0.07, MEDAL_R + 0.07, 0.1, 12).rotateX(Math.PI / 2), lit, 0, DAIS_H + MEDAL_Y, -0.02);
  return [
    prism(0.42, 0.46, 0.12, 8, ART.trim, 0, DAIS_H),
    alternate(prism(0.27, 0.31, 0.62, 8, lit, 0, DAIS_H + 0.12), shade, 2),
    prism(0.36, 0.34, 0.09, 8, ART.trimShade, 0, DAIS_H + 0.74),
    alternate(prism(0.1, 0.16, 0.18, 6, shade, 0, DAIS_H + 0.83), lit, 2),
    alternate(frame, shade, 2),
  ];
}

/** A quad of width w and height h facing +z at (0, y, z) whose uvs cover `rect`. */
function plate(w: number, h: number, y: number, z: number, rect: readonly [number, number, number, number]): BufferGeometry {
  const [u0, v0, u1, v1] = rect;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-w / 2, y - h / 2, z, w / 2, y - h / 2, z, w / 2, y + h / 2, z, -w / 2, y + h / 2, z]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** A round medallion facing +z whose uvs cover `rect` (the badge image's square). */
function medal(y: number, z: number, rect: readonly [number, number, number, number]): BufferGeometry {
  const g = new CircleGeometry(MEDAL_R, 16);
  const [u0, v0, u1, v1] = rect;
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g.translate(0, y, z);
}

/**
 * The trophy hall on its site: the pavilion and one pedestal per trophy (metal per badge) in a horseshoe facing the
 * middle, each with a medallion and a name plate mapped to its atlas cell. `cells[i]` belongs to `metals[i]`; `white` is
 * the uv of a white atlas texel.
 */
export function hallGeometry(site: HallSite, metals: readonly Metal[], cells: readonly AtlasCell[], white: readonly [number, number]): HallGeometry {
  const slots = pedestalSlots(metals.length, site.r);
  const parts: BufferGeometry[] = pavilion(site.r);
  const faces: BufferGeometry[] = [];
  slots.forEach((s, i) => {
    for (const g of pedestal(metals[i] ?? 'gold')) parts.push(at(g, s.x, 0, s.z, s.yaw));
    const cell = cells[i]!;
    faces.push(at(medal(DAIS_H + MEDAL_Y, 0.035, cell.medal), s.x, 0, s.z, s.yaw));
    faces.push(at(plate(0.5, 0.13, DAIS_H + 0.5, 0.31, cell.name), s.x, 0, s.z, s.yaw));
  });
  const solid = parts.map((g) => fill(g, 'uv', white));
  const lit = faces.map((g) => fill(g.toNonIndexed(), 'color', [1, 1, 1]));
  const place = new Matrix4().makeRotationY(site.face).setPosition(site.x, 0, site.z);
  return { geometry: mergeGeometries([...solid, ...lit])!.applyMatrix4(place), slots };
}
