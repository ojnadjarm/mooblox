import { BufferAttribute, BufferGeometry, Color } from 'three';
import { bakeAo } from './landmarks/shapes';

/**
 * Flight sizes (metres): highest riser the kid capsule climbs at a walk with room to spare, tread, depth hidden in the high
 * level, landing depth kept clear at each end, and a landing pier's shortest length (the landing plus the kid's radius).
 */
export const STAIR = { rise: 0.3, tread: 0.42, inset: 0.5, landing: 1.5, pier: 2 } as const;
/** A landing pier's top stands this far over the level it reaches into: a shared plane would z-fight with the level's grass. */
const PIER_LIFT = 0.012;

/** One flight of steps from a low walkable level up to a high one (world space). */
export interface Stair {
  /** Centre of the flight's top edge, where it meets the high level. */
  readonly x: number;
  readonly z: number;
  /** Yaw pointing down the flight, from the high level towards the low one (local +z). */
  readonly face: number;
  readonly low: number;
  readonly high: number;
  readonly width: number;
  /** Horizontal length from the top edge to the foot. */
  readonly run: number;
  /** Length of the landing pier behind the top edge at the high level; 0 when the flight meets the level directly. */
  readonly pier: number;
}

/** A ground rectangle centred on (x, z), `half` across and `long` along yaw `face`. */
export interface StairBox {
  readonly x: number;
  readonly z: number;
  readonly face: number;
  readonly half: number;
  readonly long: number;
  /** Walking level on it. */
  readonly y: number;
}

/** Risers of a flight climbing `rise` metres. */
export function stairSteps(rise: number): number {
  return Math.max(2, Math.ceil(rise / STAIR.rise - 1e-6));
}

/** A flight whose top edge centre is (x, z), descending along `face` from `high` to `low`, with a `pier` metres long. */
export function makeStair(x: number, z: number, face: number, low: number, high: number, width: number, pier = 0): Stair {
  return { x, z, face, low, high, width, run: (stairSteps(high - low) - 1) * STAIR.tread, pier };
}

/** The ground the flight covers and its two landings (`STAIR.landing` deep beyond each end, as wide as the flight). */
export function stairBoxes(s: Stair): { flight: StairBox; low: StairBox; high: StairBox } {
  const ux = Math.sin(s.face);
  const uz = Math.cos(s.face);
  const at = (d: number, long: number, y: number): StairBox => ({ x: s.x + ux * d, z: s.z + uz * d, face: s.face, half: s.width / 2, long: long / 2, y });
  return {
    flight: at(s.run / 2, s.run, s.low),
    low: at(s.run + STAIR.landing / 2, STAIR.landing, s.low),
    high: at(-STAIR.landing / 2, STAIR.landing, s.high),
  };
}

/** Whether (x, z) lies in box `b` grown by `pad`. */
export function inBox(b: StairBox, x: number, z: number, pad = 0): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  const along = dx * Math.sin(b.face) + dz * Math.cos(b.face);
  const across = dx * Math.cos(b.face) - dz * Math.sin(b.face);
  return Math.abs(along) <= b.long + pad && Math.abs(across) <= b.half + pad;
}

/** Points of box `b` every `step` metres, edges included. */
export function boxSamples(b: StairBox, step: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const na = Math.max(1, Math.ceil((2 * b.long) / step));
  const nc = Math.max(1, Math.ceil((2 * b.half) / step));
  for (let i = 0; i <= na; i++) {
    for (let j = 0; j <= nc; j++) {
      const along = -b.long + (2 * b.long * i) / na;
      const across = -b.half + (2 * b.half * j) / nc;
      out.push({ x: b.x + Math.sin(b.face) * along + Math.cos(b.face) * across, z: b.z + Math.cos(b.face) * along - Math.sin(b.face) * across });
    }
  }
  return out;
}

/**
 * The flight as one closed stepped prism in world space: per step a tread, a riser and one side quad each side, side quads
 * abutting (never overlapping, so the sides cannot z-fight); the top step reaches `STAIR.inset` back into the high level.
 */
export function stairFlight(s: Stair, colours: StairColours): BufferGeometry {
  const n = stairSteps(s.high - s.low);
  const rise = (s.high - s.low) / n;
  const w = s.width / 2;
  const { quad, geometry } = quads();
  for (let j = 0; j < n - 1; j++) {
    const z0 = j === 0 ? -STAIR.inset : j * STAIR.tread;
    const z1 = (j + 1) * STAIR.tread;
    const top = s.low + (n - 1 - j) * rise;
    const next = s.low + (n - 2 - j) * rise;
    quad([[-w, top, z0], [-w, top, z1], [w, top, z1], [w, top, z0]], [0, 1, 0], colours.tread);
    quad([[-w, next, z1], [w, next, z1], [w, top, z1], [-w, top, z1]], [0, 0, 1], colours.riser);
    quad([[w, s.low, z0], [w, top, z0], [w, top, z1], [w, s.low, z1]], [1, 0, 0], colours.side);
    quad([[-w, s.low, z1], [-w, top, z1], [-w, top, z0], [-w, s.low, z0]], [-1, 0, 0], colours.side);
  }
  return bakeAo(geometry().rotateY(s.face).translate(s.x, 0, s.z), s.low, s.high - s.low, 0.2);
}

/**
 * A landing pier at the stair's high level (world space): a block `s.pier` deep behind the top edge plus `STAIR.inset`
 * into the raised level, 0.2 m wider than the flight each side, so a landmark on the raised level never stands at the stair head;
 * its top `PIER_LIFT` over the level.
 */
export function stairPier(s: Stair, colours: StairColours): BufferGeometry {
  const w = s.width / 2 + 0.2;
  const z0 = -s.pier - STAIR.inset;
  const y0 = s.low;
  const y1 = s.high + PIER_LIFT;
  const { quad, geometry } = quads();
  quad([[-w, y1, z0], [-w, y1, 0], [w, y1, 0], [w, y1, z0]], [0, 1, 0], colours.tread);
  quad([[-w, y0, 0], [w, y0, 0], [w, y1, 0], [-w, y1, 0]], [0, 0, 1], colours.riser);
  quad([[w, y0, z0], [w, y1, z0], [w, y1, 0], [w, y0, 0]], [1, 0, 0], colours.side);
  quad([[-w, y0, 0], [-w, y1, 0], [-w, y1, z0], [-w, y0, z0]], [-1, 0, 0], colours.side);
  return bakeAo(geometry().rotateY(s.face).translate(s.x, 0, s.z), s.low, s.high - s.low, 0.2);
}

/** Colours of a flight: treads (and the pier top), risers, sides. */
export interface StairColours {
  readonly tread: number;
  readonly riser: number;
  readonly side: number;
}

/** Flat-shaded, vertex-coloured quads collected into one non-indexed geometry. */
function quads(): { quad: (q: readonly (readonly [number, number, number])[], normal: readonly [number, number, number], hex: number) => void; geometry: () => BufferGeometry } {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new Color();
  return {
    quad: (q, normal, hex) => {
      c.set(hex);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[i]!);
        nor.push(...normal);
        col.push(c.r, c.g, c.b);
      }
    },
    geometry: () => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
      return g;
    },
  };
}
