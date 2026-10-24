import type { BufferGeometry } from 'three';
import type { LookPalette } from '../look';
import { alternate, bakeAo, bands, bowl, box, cone, disc, dome, gable, prism, rock } from './shapes';

/** A hand-made hero model in local space (front = +z, standing on y 0); parts are painted, flat-normal geometry. */
export interface Landmark {
  readonly parts: readonly BufferGeometry[];
  /** Lit lantern or window geometry for the glow mesh. */
  readonly glow: readonly BufferGeometry[];
  readonly height: number;
  /** Ground reach round the axis (metres). */
  readonly radius: number;
  /** Where a pennant (with its own pole, `h` high) flies, or null. */
  readonly flag: { readonly x: number; readonly y: number; readonly z: number; readonly h: number } | null;
}

export type LandmarkBuilder = (p: LookPalette, accent: number, accentShade: number) => Landmark;

const INK = 0x2b2f3a;
const WINDOW = 0x3f5d8a;
const WHITE = 0xfffdf5;
const GOLD = 0xf6c445;
const CORAL = 0xf07a5f;
const RED = 0xe5484d;
const GLASS = 0xcff0e8;
const GLASS_B = 0xa6dcd4;

const done = (parts: BufferGeometry[], glow: BufferGeometry[], height: number, radius: number, flag: Landmark['flag']): Landmark => {
  for (const g of parts) bakeAo(g, 0, 1.2, 0.28);
  return { parts, glow, height, radius, flag };
};

/** Hub: clock tower with four faces, a pyramid roof in the accent and a weather vane (15.6 m). */
export const clockTower: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [box(4.4, 0.6, 4.4, p.trimShade), box(3.2, 7, 3.2, p.wall, 0, 0.6)];
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) parts.push(box(0.5, 7, 0.5, p.trim, x, 0.6, z));
  parts.push(box(3.6, 0.35, 3.6, p.trim, 0, 4.2), box(3.7, 0.4, 3.7, p.trimShade, 0, 7.6));
  parts.push(box(1.3, 2.1, 0.12, p.woodDark, 0, 0.6, 1.62), box(1.6, 0.25, 0.2, p.trim, 0, 2.7, 1.64));
  for (const z of [-1.62, 1.62]) for (const y of [4.9, 6.1]) parts.push(box(0.5, 0.8, 0.08, WINDOW, 0, y, z));
  for (const x of [-1.62, 1.62]) parts.push(box(0.08, 0.8, 0.5, WINDOW, x, 5.4, 0));
  parts.push(box(3.4, 3.1, 3.4, p.wall, 0, 8));
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) parts.push(box(0.45, 3.1, 0.45, p.trim, x, 8, z));
  parts.push(box(4.1, 0.45, 4.1, p.trim, 0, 11.1));
  const faces: [number, number, number][] = [[0, 1.76, 0], [0, -1.76, Math.PI], [1.76, 0, Math.PI / 2], [-1.76, 0, -Math.PI / 2]];
  for (const [fx, fz, turn] of faces) {
    const face = [disc(1.3, 0.1, 12, accent, 0, 9.55, 0), disc(1.1, 0.14, 12, WHITE, 0, 9.55, 0.03), box(0.12, 0.8, 0.06, INK, 0, 9.5, 0.12), box(0.6, 0.12, 0.06, INK, 0.25, 9.5, 0.12)];
    for (const g of face) parts.push(g.rotateY(turn).translate(fx, 0, fz));
  }
  parts.push(cone(3.1, 3.6, 4, accent, 0, 11.55, 0, Math.PI / 4), prism(2.25, 2.25, 0.18, 4, shade, 0, 11.55, 0, false).rotateY(Math.PI / 4));
  parts.push(prism(0.06, 0.06, 1.3, 6, INK, 0, 14.9), prism(0.2, 0.2, 0.3, 8, GOLD, 0, 15.5), box(1.2, 0.08, 0.08, INK, 0, 15.95));
  parts.push(cone(0.3, 0.35, 3, GOLD, 0.6, 15.85, 0));
  return done(parts, [], 16.2, 3.1, null);
};

/** Library: columned hall with a pediment and a faceted dome in the accent (8.6 m). */
export const library: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [box(6.4, 0.3, 5, p.trimShade), box(6, 0.3, 4.6, p.trim, 0, 0.3), box(5.2, 3.4, 3.6, p.wall, 0, 0.6, -0.3)];
  for (const x of [-2.1, -0.7, 0.7, 2.1]) parts.push(prism(0.24, 0.28, 3.2, 8, p.trim, x, 0.6, 1.9), box(0.6, 0.2, 0.6, p.trimShade, x, 3.75, 1.9));
  parts.push(box(5.6, 0.35, 4.6, p.trim, 0, 3.95, 0.2));
  parts.push(gable(5.6, 1.2, 1.1, accent, 0, 4.3, 1.75));
  parts.push(box(1.1, 2, 0.1, p.woodDark, 0, 0.6, 1.5));
  for (const x of [-1.6, 1.6]) parts.push(box(0.7, 1.4, 0.1, WINDOW, x, 1.4, 1.5));
  parts.push(prism(2, 2, 1.1, 8, p.wall, 0, 4.3, -0.4), prism(2.15, 2.15, 0.2, 8, p.trim, 0, 5.3, -0.4));
  parts.push(dome(2.05, 8, 3, accent, 0, 5.4, -0.4), prism(0.45, 0.45, 0.8, 8, p.trim, 0, 7.4, -0.4), cone(0.55, 0.8, 8, shade, 0, 8.2, -0.4));
  parts.push(cone(0.15, 0.4, 6, GOLD, 0, 9, -0.4));
  return done(parts, [], 9.4, 3.4, { x: 2.9, y: 0.6, z: 2.2, h: 3 });
};

/** Science: faceted glass greenhouse dome and a rocket on its launch pad (9.3 m). */
export const science: LandmarkBuilder = (p, accent) => {
  const parts: BufferGeometry[] = [prism(2.7, 2.9, 0.5, 8, p.trim, -0.9, 0, -0.4)];
  parts.push(alternate(dome(2.5, 8, 4, GLASS, -0.9, 0.5, -0.4), GLASS_B, 2), prism(0.35, 0.35, 0.5, 8, accent, -0.9, 2.95, -0.4));
  parts.push(box(1, 1.6, 0.1, p.trim, -0.9, 0.5, 2.05), box(0.7, 1.3, 0.06, p.woodDark, -0.9, 0.5, 2.1));
  const rx = 2.1;
  const rz = 1;
  parts.push(prism(1.1, 1.3, 0.4, 8, p.rock, rx, 0, rz), prism(0.6, 0.6, 5, 8, WHITE, rx, 0.9, rz));
  parts.push(prism(0.62, 0.62, 0.5, 8, accent, rx, 2.4, rz), cone(0.6, 2, 8, CORAL, rx, 5.9, rz), disc(0.28, 0.1, 8, WINDOW, rx, 4.6, rz + 0.58));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const fin = box(0.12, 1.4, 0.9, CORAL, 0, 0.6, 0.55);
    parts.push(fin.rotateY(a).translate(rx, 0, rz));
  }
  for (const [x, z] of [[rx - 0.75, rz], [rx + 0.75, rz]] as const) parts.push(box(0.12, 1.2, 0.12, INK, x, 0.4, z));
  return done(parts, [], 7.9, 3.4, { x: -2.7, y: 0, z: 1.7, h: 3.2 });
};

/** Sports: a mini stadium ring with tiered seats, a green field, coral flags and two floodlights (8 m). */
export const stadium: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [prism(3.9, 4, 0.3, 12, p.trimShade)];
  parts.push(bands(prism(3.8, 3.9, 2, 12, p.wall, 0, 0.3, 0, true, 4), [[1.3, p.wall], [1.8, accent], [9, p.wall]]));
  parts.push(prism(4, 4, 0.25, 12, p.trim, 0, 2.3, 0, true));
  parts.push(bowl(3.75, 3.1, 1.4, 12, accent, 0.9), bowl(3.1, 2.6, 0.6, 12, shade, 0.3));
  parts.push(prism(2.6, 2.6, 0.4, 12, 0x6fbf55, 0, 0.1), box(0.08, 0.02, 4.4, WHITE, 0, 0.5));
  for (const z of [-1.9, 1.9]) parts.push(box(1.2, 0.7, 0.1, WHITE, 0, 0.5, z));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.26;
    const x = Math.cos(a) * 3.95;
    const z = Math.sin(a) * 3.95;
    parts.push(box(0.08, 1.6, 0.08, INK, x, 2.5, z), box(0.08, 0.45, 0.7, k % 2 ? accent : GOLD, x, 3.6, z + 0.35));
  }
  for (const x of [-2.3, 2.3]) parts.push(box(0.3, 7, 0.3, INK, x, 0.9, -2.3), box(1.2, 0.6, 0.35, p.trimShade, x, 7.9, -2.3));
  const glow = [-2.3, 2.3].map((x) => box(1, 0.4, 0.1, 0xfff1c8, x, 8, -2.1));
  return done(parts, glow, 8.5, 4, null);
};

/** Arts: round striped theatre tent with a stage awning and a pennant (7.4 m). */
export const theatre: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [prism(3.4, 3.5, 0.3, 12, p.trimShade)];
  parts.push(alternate(prism(3.1, 3.1, 2.4, 12, accent, 0, 0.3), WHITE, 2), prism(3.3, 3.3, 0.2, 12, shade, 0, 2.7));
  parts.push(alternate(cone(3.6, 3, 12, accent, 0, 2.9), WHITE, 2));
  parts.push(box(2.2, 2, 0.1, CORAL, 0, 0.3, 3.08), box(1.4, 1.8, 0.12, INK, 0, 0.3, 3.1), box(2.6, 0.25, 0.9, accent, 0, 2.35, 3.4));
  for (const x of [-1.2, 1.2]) parts.push(box(0.1, 2, 0.1, p.woodDark, x, 0.3, 3.8));
  return done(parts, [], 7.6, 3.6, { x: 0, y: 5.75, z: 0, h: 1.9 });
};

/** Harbour: red-and-white lighthouse on a rocky point with a glowing lantern (11.2 m). */
export const lighthouse: LandmarkBuilder = (p) => {
  const parts: BufferGeometry[] = [rock(1.8, p.rock, -0.6, 0.4, 0.4), rock(1.4, p.rock, 1.1, 0.3, -0.5), rock(1, p.rock, 0.6, 0.2, 1.4)];
  parts.push(prism(1.6, 1.7, 0.6, 8, p.trimShade, 0, 0.5));
  parts.push(bands(prism(1, 1.4, 7, 8, WHITE, 0, 1.1, 0, false, 4), [[2.85, RED], [4.6, WHITE], [6.35, RED], [20, WHITE]]));
  parts.push(prism(1.5, 1.4, 0.3, 8, INK, 0, 8.1), prism(0.85, 0.85, 1.2, 8, 0xfff1c8, 0, 8.4), cone(1.15, 1.2, 8, RED, 0, 9.6));
  parts.push(box(0.8, 1.3, 0.1, p.woodDark, 0, 1.1, 1.36));
  for (const y of [3.4, 5.4]) parts.push(box(0.4, 0.6, 0.1, WINDOW, 0, y, 1.42 - ((y + 0.3 - 1.1) / 7) * 0.4));
  parts.push(cone(0.18, 0.5, 6, GOLD, 0, 10.8));
  return done(parts, [prism(0.8, 0.8, 1.1, 8, 0xfff1c8, 0, 8.45)], 11.3, 2.4, null);
};
