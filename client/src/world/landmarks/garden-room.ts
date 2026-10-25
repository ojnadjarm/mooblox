import { OctahedronGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LookPalette } from '../look';
import { bakeAo, box, facet, lathe } from './shapes';

/** What a garden room holds: a reading lawn (giant open book, beanbags) or a flower parterre (four beds, a bench). */
export type RoomKind = 'reading' | 'parterre';

/** A ground circle in the room's frame (metres). */
export interface RoomSpot {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/**
 * A hedge-walled garden room (district concept), room-local: +z is the open front, the floor is the lawn at y = 0.
 * `hedges` and `inside` are merged meshes; `walls` the obstacle circles (none overlapping); `seats` where kids sit, facing `face`
 * (room-local yaw); `tree` the back corner a kit tree stands in; `bench` the parterre's bench spot (yaw faces the opening).
 */
export interface GardenRoom {
  readonly hedges: BufferGeometry;
  readonly inside: BufferGeometry;
  readonly walls: readonly RoomSpot[];
  readonly seats: readonly { readonly x: number; readonly z: number; readonly face: number }[];
  readonly tree: { readonly x: number; readonly z: number };
  readonly bench: { readonly x: number; readonly z: number; readonly yaw: number } | null;
}

/** A room's hedge centre-line rectangle: width (x) and depth (z), metres. */
export interface RoomSize {
  readonly w: number;
  readonly d: number;
}

/** Room sizes, largest first (small districts take the small one), hedge thickness and the front opening. */
export const ROOMS: readonly RoomSize[] = [{ w: 6.6, d: 5 }, { w: 5.4, d: 4.2 }];
export const HEDGE_THICK = 0.7;
const OPEN = 2;

/** How far a room of `size` reaches from its centre, hedges included. */
export const roomReach = (size: RoomSize): number => Math.hypot(size.w / 2 + HEDGE_THICK / 2, size.d / 2 + HEDGE_THICK / 2);

const BLOCK = 1.1;
const BLOCK_GAP = 0.08;
const PAGE = 0xfff4e0;
const INK = 0xc9bba0;
const RIBBON = 0xe5484d;
const BAGS = [0xf07a5f, 0x2fa39a, 0xf6c445, 0x9a7be0];
const FLOWERS = [0xf06c8a, 0xf6c445, 0x9a7be0, 0xfff4e0];

/** One clipped hedge block `len` long (along x), `w` thick and `h` high: square in plan, soft bulging sides and a rounded top. */
function hedgeBlock(len: number, w: number, h: number, colour: number): BufferGeometry {
  const g = lathe([[1, 0], [1.05, 0.4], [0.94, 0.78], [0.6, 0.97], [0, 1]], 4, colour, 0, 0, 0, true, Math.PI / 4).scale(len / Math.SQRT2, h, w / Math.SQRT2);
  return bakeAo(g, 0, 0.3, 0.4);
}

/** A run of hedge blocks from (x0, z0) to (x1, z1), axis-aligned; returns its obstacle circles too. */
function hedgeRun(x0: number, z0: number, x1: number, z1: number, colour: number, random: () => number, parts: BufferGeometry[], walls: RoomSpot[]): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round((len + BLOCK_GAP) / (BLOCK + BLOCK_GAP)));
  const piece = (len - (n - 1) * BLOCK_GAP) / n;
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  for (let k = 0; k < n; k++) {
    const t = (k * (piece + BLOCK_GAP) + piece / 2) / len;
    const block = hedgeBlock(piece, HEDGE_THICK, 0.85 + random() * 0.12, colour);
    parts.push(block.rotateY(yaw).translate(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t));
  }
  const r = HEDGE_THICK / 2;
  const m = Math.floor(len / (2 * r * 1.001)) + 1;
  for (let k = 0; k < m; k++) {
    const t = m === 1 ? 0.5 : k / (m - 1);
    walls.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r });
  }
}

/** A giant open book lying on the lawn, spine along z: accent cover, two cream page stacks dipping to the gutter, text lines, a ribbon. */
function book(accent: number, x: number, z: number): BufferGeometry[] {
  const parts = [bakeAo(box(2.1, 0.1, 1.5, accent), 0, 0.12, 0.3)];
  for (const side of [-1, 1]) {
    const tilt = side * 0.09;
    const stack = box(0.98, 0.2, 1.36, PAGE, 0, -0.1, 0).rotateZ(tilt).translate(side * 0.51, 0.2, 0);
    parts.push(stack);
    for (let l = 0; l < 4; l++) parts.push(box(0.62, 0.012, 0.07, INK).rotateZ(tilt).translate(side * 0.53, 0.3, -0.4 + l * 0.26));
  }
  parts.push(box(0.12, 0.02, 0.9, RIBBON, 0.02, 0.17, 0.45).rotateX(0.22));
  return parts.map((g) => g.translate(x, 0, z));
}

/** A soft beanbag: a slumped round blob ~1 m across. */
function beanbag(colour: number, x: number, z: number, s: number): BufferGeometry {
  const g = lathe([[0, 0], [0.44, 0.02], [0.52, 0.14], [0.48, 0.3], [0.32, 0.42], [0, 0.46]], 8, colour, 0, 0, 0, true).scale(s, s, s * 0.92);
  return bakeAo(g, 0, 0.2, 0.35).translate(x, 0, z);
}

/** A raised flower bed: a cream kerb box, dark soil and a spray of flowers round a small round topiary. */
function bed(p: LookPalette, s: number, x: number, z: number, random: () => number): BufferGeometry[] {
  const parts = [bakeAo(box(s, 0.28, s, p.trim, x, 0, z), 0, 0.3, 0.3), box(s - 0.2, 0.02, s - 0.2, p.dirtDark, x, 0.28, z)];
  parts.push(bakeAo(lathe([[0, 0], [0.3, 0.05], [0.36, 0.3], [0.24, 0.56], [0, 0.62]], 6, p.leaves[0] ?? p.grass, x, 0.28, z, true), 0.28, 0.3, 0.35));
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * Math.PI * 2 + random() * 0.5;
    parts.push(facet(new OctahedronGeometry(0.15, 0), FLOWERS[Math.floor(random() * FLOWERS.length)]!, x + Math.cos(a) * s * 0.33, 0.42, z + Math.sin(a) * s * 0.33));
  }
  return parts;
}

/** Builds one garden room of `kind` and `size` in the palette, the district accent on the book cover and a beanbag; `random` varies it. */
export function gardenRoom(kind: RoomKind, size: RoomSize, p: LookPalette, accent: number, random: () => number): GardenRoom {
  const hx = size.w / 2;
  const hz = size.d / 2;
  const big = size.w >= ROOMS[0]!.w;
  const leaf = p.leaves[0] ?? p.grass;
  const hedges: BufferGeometry[] = [];
  const walls: RoomSpot[] = [];
  hedgeRun(-hx, -hz, hx, -hz, leaf, random, hedges, walls);
  for (const side of [-1, 1]) {
    hedgeRun(side * hx, -hz + HEDGE_THICK, side * hx, hz, leaf, random, hedges, walls);
    hedgeRun(side * hx - side * HEDGE_THICK, hz, side * (OPEN / 2 + 0.2), hz, leaf, random, hedges, walls);
    const ball = lathe([[0, 0], [0.32, 0.08], [0.42, 0.36], [0.3, 0.66], [0, 0.74]], 8, p.leaves[1] ?? leaf, side * (OPEN / 2 + 0.55), 0.9, hz, true);
    hedges.push(bakeAo(ball, 0.9, 0.3, 0.3));
  }
  const tree = { x: -hx + 1.3, z: -hz + 1.2 };
  const inside: BufferGeometry[] = [];
  const seats: { x: number; z: number; face: number }[] = [];
  let bench: GardenRoom['bench'] = null;
  if (kind === 'reading') {
    const bx = hx * 0.12;
    const bz = -hz + 1.4;
    inside.push(...book(accent, bx, bz));
    walls.push({ x: bx, z: bz, r: 1.05 });
    const first = Math.floor(random() * BAGS.length);
    const spots: [number, number][] = [[bx + 1.35, bz + 1.35], [bx - 1.35, bz + 1.35]];
    if (big) spots.push([-hx + 1.2, hz - 1.2]);
    spots.forEach(([x, z], i) => {
      inside.push(beanbag(i === 0 ? accent : BAGS[(first + i) % BAGS.length]!, x, z, 0.95 + random() * 0.15));
      walls.push({ x, z, r: 0.5 });
    });
    seats.push({ x: bx, z: bz + 1.45, face: Math.PI });
  } else {
    const s = Math.min(1.5, (size.d - HEDGE_THICK - 1) / 2);
    const step = (s + 0.4) / 2;
    const cz = -0.2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      inside.push(...bed(p, s, 0.6 + dx * step, cz + dz * step, random));
      walls.push({ x: 0.6 + dx * step, z: cz + dz * step, r: s / 2 + 0.03 });
    }
    bench = { x: -hx + 0.85, z: 0.4, yaw: 0 };
  }
  const merge = (parts: BufferGeometry[]) => {
    const g = mergeGeometries(parts, false)!;
    for (const part of parts) part.dispose();
    return g;
  };
  return { hedges: merge(hedges), inside: merge(inside), walls, seats, tree, bench };
}
