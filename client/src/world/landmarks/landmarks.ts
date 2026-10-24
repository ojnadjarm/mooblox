import type { BufferGeometry } from 'three';
import type { LookPalette } from '../look';
import { alternate, bakeAo, bands, bowl, box, cone, disc, dome, gable, gore, hipRoof, lathe, prism, rock } from './shapes';

/** A hand-made hero model in local space (front = +z, standing on y 0); parts are painted geometry, faceted or soft per part. */
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

/** An arched opening facing +z: a door slab with a half-round head and a trim surround (bottom on y, face at z). */
const arch = (w: number, h: number, fill: number, rim: number, x: number, y: number, z: number): BufferGeometry[] => [
  box(w + 0.3, h - w / 2 + 0.15, 0.08, rim, x, y, z - 0.02), disc(w / 2 + 0.15, 0.08, 10, rim, x, y + h - w / 2, z - 0.02),
  box(w, h - w / 2, 0.1, fill, x, y, z), disc(w / 2, 0.1, 10, fill, x, y + h - w / 2, z),
];

/** Hub: clock tower on a stepped plinth, arched door, four clock faces, a flared curved roof and a rooster vane (17 m). */
export const clockTower: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [box(4.8, 0.35, 4.8, p.trimShade), box(4.2, 0.35, 4.2, p.trim, 0, 0.35), box(3.2, 7, 3.2, p.wall, 0, 0.7)];
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) parts.push(box(0.5, 7, 0.5, p.trim, x, 0.7, z));
  parts.push(box(3.6, 0.35, 3.6, p.trim, 0, 4.3), box(3.7, 0.4, 3.7, p.trimShade, 0, 7.7));
  parts.push(...arch(1.1, 2.3, p.woodDark, p.trim, 0, 0.7, 1.62));
  for (const z of [-1.62, 1.62]) parts.push(...arch(0.5, 1.1, WINDOW, p.trim, 0, 5, z));
  for (const x of [-1.62, 1.62]) parts.push(...arch(0.5, 1.1, WINDOW, p.trim, 0, 5, 0).map((g) => g.rotateY(Math.PI / 2).translate(x, 0, 0)));
  parts.push(box(3.4, 3.1, 3.4, p.wall, 0, 8.1));
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) parts.push(box(0.45, 3.1, 0.45, p.trim, x, 8.1, z));
  parts.push(box(4.1, 0.45, 4.1, p.trim, 0, 11.2));
  const faces: [number, number, number][] = [[0, 1.76, 0], [0, -1.76, Math.PI], [1.76, 0, Math.PI / 2], [-1.76, 0, -Math.PI / 2]];
  for (const [fx, fz, turn] of faces) {
    const face = [disc(1.3, 0.1, 16, accent, 0, 9.65, 0), disc(1.1, 0.14, 16, WHITE, 0, 9.65, 0.03), box(0.12, 0.8, 0.06, INK, 0, 9.6, 0.12), box(0.6, 0.12, 0.06, INK, 0.25, 9.6, 0.12)];
    for (const g of face) parts.push(g.rotateY(turn).translate(fx, 0, fz));
  }
  // Flared roof: curved hips that kick out at the eaves (4 sides, faceted so the hips stay crisp).
  parts.push(lathe([[3.3, 0], [3.05, 0.22], [2.45, 0.8], [1.7, 1.75], [0.95, 2.9], [0.35, 3.9], [0, 4.3]], 4, accent, 0, 11.65, 0, false, Math.PI / 4));
  parts.push(prism(2.3, 2.3, 0.18, 4, shade, 0, 11.6, 0, false).rotateY(Math.PI / 4));
  parts.push(prism(0.06, 0.06, 1.2, 6, INK, 0, 15.8), prism(0.22, 0.22, 0.3, 8, GOLD, 0, 15.9), box(1.2, 0.08, 0.08, INK, 0, 16.5));
  parts.push(cone(0.3, 0.35, 3, GOLD, 0.6, 16.4, 0));
  parts.push(box(0.5, 0.32, 0.14, GOLD, 0, 16.75), box(0.16, 0.3, 0.14, GOLD, 0.2, 17.05), cone(0.22, 0.42, 4, GOLD, -0.3, 16.85, 0).rotateZ(0.3));
  return done(parts, [], 17.3, 3.2, null);
};

/** Library: podium with a grand stair, four-column portico and pediment, a drum of round windows and a ribbed dome (10 m). */
export const library: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [box(8.2, 0.5, 6.8, p.trimShade, 0, 0, -0.8), box(7.6, 0.5, 6.2, p.trim, 0, 0.5, -0.8)];
  for (let k = 0; k < 5; k++) parts.push(box(3.4, (5 - k) * 0.2, 0.36, k % 2 ? p.trimShade : p.trim, 0, 0, 2.38 + k * 0.36));
  for (const x of [-1.95, 1.95]) parts.push(box(0.5, 1.15, 1.9, p.trimShade, x, 0, 3.15), prism(0.2, 0.25, 0.25, 8, p.trim, x, 1.15, 3.9));
  parts.push(box(6, 3.6, 4, p.wall, 0, 1, -1.6));
  for (const x of [-2.2, -0.75, 0.75, 2.2]) {
    parts.push(box(0.7, 0.22, 0.7, p.trimShade, x, 1, 1.7), prism(0.27, 0.3, 3.1, 10, p.trim, x, 1.22, 1.7), box(0.72, 0.28, 0.72, p.trimShade, x, 4.3, 1.7));
  }
  parts.push(...arch(1.2, 2.5, p.woodDark, p.trim, 0, 1, 0.42));
  for (const x of [-1.9, 1.9]) parts.push(...arch(0.8, 1.9, WINDOW, p.trim, x, 1.5, 0.42));
  parts.push(box(6.6, 0.5, 6, p.trim, 0, 4.58, -0.9), box(6.9, 0.18, 6.3, p.trimShade, 0, 5.08, -0.9));
  parts.push(gable(0.7, 6.4, 1.4, accent).rotateY(Math.PI / 2).translate(0, 5.26, 1.6), gable(0.72, 5.4, 1.05, p.trim).rotateY(Math.PI / 2).translate(0, 5.32, 1.62));
  parts.push(prism(2.3, 2.3, 1.4, 12, p.wall, 0, 5.26, -1.3), prism(2.5, 2.5, 0.25, 12, p.trim, 0, 6.66, -1.3));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    for (const g of [disc(0.52, 0.1, 12, p.trim, 0, 5.96, 2.27), disc(0.4, 0.12, 12, WINDOW, 0, 5.96, 2.3), box(0.06, 0.8, 0.14, p.trim, 0, 5.56, 2.31)]) {
      parts.push(g.translate(0, 0, 0).rotateY(a).translate(0, 0, -1.3));
    }
  }
  const dome = [[2.35, 0], [2.3, 0.45], [2.12, 0.95], [1.8, 1.45], [1.3, 1.9], [0.7, 2.2], [0, 2.32]] as const;
  parts.push(alternate(lathe(dome, 12, accent, 0, 6.9, -1.3), shade, gore(dome.length)));
  parts.push(prism(0.55, 0.55, 0.7, 8, p.trim, 0, 9.05, -1.3), lathe([[0.7, 0], [0.6, 0.25], [0.3, 0.5], [0, 0.58]], 8, accent, 0, 9.75, -1.3));
  parts.push(prism(0.06, 0.06, 0.5, 6, INK, 0, 10.3, -1.3), prism(0.16, 0.16, 0.2, 8, GOLD, 0, 10.6, -1.3));
  return done(parts, [], 10.8, 3.7, { x: 3.3, y: 1, z: 1.8, h: 3 });
};

/** Science: a big faceted glass greenhouse dome on a stone drum and a round-nosed rocket by its gantry (8.4 m). */
export const science: LandmarkBuilder = (p, accent) => {
  const gx = -0.9;
  const gz = -0.6;
  const parts: BufferGeometry[] = [prism(3.3, 3.5, 0.8, 12, p.trim, gx, 0, gz), prism(3.4, 3.4, 0.18, 12, WHITE, gx, 0.8, gz)];
  parts.push(alternate(dome(3.15, 10, 5, GLASS, gx, 0.95, gz), GLASS_B, 2));
  for (let k = 0; k < 5; k++) parts.push(lathe([[3.22, 0], [2.85, 1.45], [1.65, 2.7], [0, 3.22]], 1, WHITE, gx, 0.95, gz, true, (k / 5) * Math.PI * 2, 0.06));
  parts.push(prism(0.5, 0.5, 0.5, 8, accent, gx, 4.1, gz), cone(0.3, 0.6, 8, WHITE, gx, 4.6, gz));
  parts.push(box(1.5, 2.1, 1.3, p.trim, gx, 0, gz + 3.3), hipRoof(1.8, 1.6, 0.7, accent, gx, 2.1, gz + 3.3), ...arch(0.9, 1.7, GLASS_B, WHITE, gx, 0.1, gz + 3.96));
  const rx = 2.6;
  const rz = 1.5;
  parts.push(prism(1.2, 1.4, 0.45, 10, p.rock, rx, 0, rz), prism(1.05, 1.05, 0.08, 10, GOLD, rx, 0.45, rz));
  const body = [[0, 0], [0.7, 0], [0.76, 0.45], [0.76, 3.9], [0.67, 4.8], [0.48, 5.7], [0.22, 6.4], [0, 6.7]] as const;
  parts.push(bands(lathe(body, 10, WHITE, rx, 1.1, rz), [[1.8, CORAL], [3.6, WHITE], [3.95, CORAL], [5.9, WHITE], [9, CORAL]]));
  for (const y of [3.1, 4.4]) parts.push(disc(0.24, 0.1, 10, p.trim, rx, y, rz + 0.75), disc(0.17, 0.12, 10, WINDOW, rx, y, rz + 0.77));
  for (let k = 0; k < 3; k++) {
    const fin = box(0.12, 1.5, 0.75, CORAL, 0, 0, 0.85);
    parts.push(fin.rotateY((k / 3) * Math.PI * 2 + 0.5).translate(rx, 1.1, rz));
  }
  for (const [x, z] of [[rx + 1.3, rz - 0.9], [rx + 1.3, rz + 0.9]] as const) parts.push(box(0.14, 5.8, 0.14, INK, x, 0.45, z));
  for (const y of [1.6, 3.2, 4.8, 6.1]) parts.push(box(0.14, 0.12, 1.94, INK, rx + 1.3, y, rz), box(0.75, 0.1, 0.12, INK, rx + 0.95, y, rz));
  return done(parts, [], 8.4, 3.6, { x: gx - 3.2, y: 0, z: gz + 2.2, h: 3.2 });
};

/** Sports: a mini stadium ring with tiered seats, a curved canopy over the back stand, coral flags and two floodlights (8.5 m). */
export const stadium: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [prism(3.9, 4, 0.3, 16, p.trimShade)];
  parts.push(bands(prism(3.8, 3.9, 2, 16, p.wall, 0, 0.3, 0, true, 4), [[1.3, p.wall], [1.8, accent], [9, p.wall]]));
  parts.push(lathe([[4.05, 0], [4.12, 0.12], [4.05, 0.26], [3.75, 0.3]], 16, p.trim, 0, 2.2));
  parts.push(bowl(3.75, 3.1, 1.4, 16, accent, 0.9), bowl(3.1, 2.6, 0.6, 16, shade, 0.3));
  parts.push(prism(2.6, 2.6, 0.4, 16, 0x6fbf55, 0, 0.1), box(0.08, 0.02, 4.4, WHITE, 0, 0.5));
  for (const z of [-1.9, 1.9]) parts.push(box(1.2, 0.7, 0.1, WHITE, 0, 0.5, z));
  parts.push(lathe([[4.15, 0], [4.05, 0.55], [3.6, 0.95], [2.85, 1.05], [2.7, 0.95]], 8, shade, 0, 3.7, 0, true, Math.PI - 0.95, 1.9));
  for (const a of [Math.PI - 0.85, Math.PI, Math.PI + 0.85]) parts.push(box(0.14, 1.6, 0.14, INK, Math.sin(a) * 3.95, 2.4, Math.cos(a) * 3.95));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.26;
    const x = Math.cos(a) * 3.95;
    const z = Math.sin(a) * 3.95;
    if (z < -2) continue;
    parts.push(box(0.08, 1.6, 0.08, INK, x, 2.5, z), box(0.08, 0.45, 0.7, k % 2 ? accent : GOLD, x, 3.6, z + 0.35));
  }
  parts.push(...arch(1.6, 2, INK, p.trim, 0, 0.3, 3.92));
  for (const x of [-2.6, 2.6]) parts.push(box(0.3, 7, 0.3, INK, x, 0.9, -2.6), box(1.2, 0.6, 0.35, p.trimShade, x, 7.9, -2.6));
  const glow = [-2.6, 2.6].map((x) => box(1, 0.4, 0.1, 0xfff1c8, x, 8, -2.4));
  return done(parts, glow, 8.5, 4, null);
};

/** Arts: a big round striped theatre tent with a bulging roof, scalloped valance and an arched entrance (9.4 m with its pennant). */
export const theatre: LandmarkBuilder = (p, accent, shade) => {
  const parts: BufferGeometry[] = [prism(4.2, 4.3, 0.3, 16, p.trimShade)];
  parts.push(alternate(prism(3.8, 3.8, 2.8, 16, accent, 0, 0.3), WHITE, 2));
  const roof = [[4.35, 0], [4.15, 0.6], [3.6, 1.65], [2.65, 2.75], [1.45, 3.55], [0.4, 3.95], [0, 4]] as const;
  parts.push(alternate(lathe(roof, 16, accent, 0, 3.05), WHITE, gore(roof.length)));
  for (let k = 0; k < 16; k++) {
    const a = ((k + 0.5) / 16) * Math.PI * 2;
    parts.push(cone(0.48, 0.5, 4, k % 2 ? WHITE : shade, 0, 0, 0, Math.PI / 4).rotateX(Math.PI).translate(Math.sin(a) * 4.2, 3.1, Math.cos(a) * 4.2));
  }
  parts.push(prism(0.25, 0.25, 0.4, 8, shade, 0, 7), prism(0.18, 0.18, 0.2, 8, GOLD, 0, 7.4));
  parts.push(box(2.8, 2.6, 0.9, accent, 0, 0.3, 3.75), ...arch(1.5, 2.1, INK, CORAL, 0, 0.3, 4.22));
  parts.push(lathe([[1.7, 0], [1.55, 0.35], [1.0, 0.65], [0, 0.75]], 8, shade, 0, 2.9, 3.75, true, -Math.PI / 2, Math.PI).scale(1, 1, 0.7).translate(0, 0, 1.1));
  for (const x of [-1.25, 1.25]) parts.push(lathe([[0.16, 0], [0.16, 2.5], [0.24, 2.6], [0, 2.7]], 8, GOLD, x, 0.3, 4.3));
  return done(parts, [], 9.4, 3.8, { x: 0, y: 7.6, z: 0, h: 1.9 });
};

/** Harbour: a red-and-white lighthouse with gallery and domed cap beside a round keeper's house, on a rocky point (12 m). */
export const lighthouse: LandmarkBuilder = (p, accent) => {
  const parts: BufferGeometry[] = [rock(2, p.rock, 0.2, 0.4, -0.6), rock(1.5, p.rock, 1.9, 0.3, 0.6), rock(1.1, p.rock, -1.9, 0.2, -1.2)];
  const tx = 0.6;
  const tz = -0.6;
  parts.push(prism(1.6, 1.75, 0.6, 10, p.trimShade, tx, 0.5, tz));
  parts.push(bands(prism(1, 1.4, 7, 10, WHITE, tx, 1.1, tz, false, 4), [[2.85, RED], [4.6, WHITE], [6.35, RED], [20, WHITE]]));
  parts.push(prism(1.6, 1.4, 0.3, 10, INK, tx, 8.1, tz));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    parts.push(box(0.07, 0.55, 0.07, INK, tx + Math.sin(a) * 1.5, 8.4, tz + Math.cos(a) * 1.5));
  }
  parts.push(lathe([[1.55, 0], [1.55, 0.08], [1.48, 0.08], [1.48, 0]], 10, INK, tx, 8.92, tz, false));
  parts.push(prism(0.9, 0.9, 0.25, 10, RED, tx, 8.4, tz), lathe([[1.2, 0], [1.1, 0.45], [0.75, 0.85], [0.3, 1.05], [0, 1.1]], 10, RED, tx, 9.85, tz));
  parts.push(prism(0.06, 0.06, 0.5, 6, INK, tx, 10.9, tz), prism(0.17, 0.17, 0.2, 8, GOLD, tx, 11.3, tz));
  parts.push(...arch(0.8, 1.5, p.woodDark, p.trim, tx, 1.1, tz + 1.36));
  for (const y of [3.4, 5.4]) parts.push(box(0.4, 0.6, 0.1, WINDOW, tx, y, tz + 1.42 - ((y + 0.3 - 1.1) / 7) * 0.4));
  const hx = -1.5;
  const hz = 1.1;
  parts.push(prism(1.55, 1.6, 0.4, 10, p.trimShade, hx, 0.3, hz), prism(1.4, 1.4, 1.7, 10, p.wall, hx, 0.7, hz));
  parts.push(lathe([[1.75, 0], [1.6, 0.35], [1.2, 0.85], [0.6, 1.2], [0, 1.32]], 10, accent, hx, 2.4, hz));
  parts.push(prism(0.22, 0.22, 0.7, 6, p.trimShade, hx + 0.6, 3.2, hz - 0.4));
  parts.push(...arch(0.7, 1.3, p.woodDark, p.trim, hx, 0.7, hz + 1.38), ...arch(0.5, 0.8, WINDOW, p.trim, 0, 1.2, 0).map((g) => g.rotateY(-Math.PI / 2.4).translate(hx - 1.32, 0, hz + 0.45)));
  return done(parts, [prism(0.8, 0.8, 1.1, 10, 0xfff1c8, tx, 8.6, tz)], 11.5, 2.8, null);
};
