import type { Surface } from './sounds';

interface Segment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
}

/** What the footstep picker reads of the world: bridge decks, walks and the paved plazas. */
export interface Ground {
  readonly bridges: readonly Segment[];
  readonly paths: readonly Segment[];
  /** Paved plaza circles (the spawn plaza and the further plazas). */
  readonly plazas: readonly { readonly x: number; readonly z: number; readonly r: number }[];
}

/** Half widths (m) of a bridge deck and of a walk, a little past their edges so a foot on the rim still counts. */
const DECK = 1.5;
const WALK = 1.3;

/** Distance squared from (x, z) to a segment. */
function dist2(s: Segment, x: number, z: number): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len));
  const px = s.ax + dx * t - x;
  const pz = s.az + dz * t - z;
  return px * px + pz * pz;
}

/** The ground under (x, z): plank bridges are wood, walks and plazas stone, the rest lawn. */
export function surfaceAt(g: Ground, x: number, z: number): Surface {
  for (const b of g.bridges) if (dist2(b, x, z) <= DECK * DECK) return 'wood';
  for (const p of g.plazas) if ((x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r) return 'stone';
  for (const s of g.paths) if (dist2(s, x, z) <= WALK * WALK) return 'stone';
  return 'grass';
}
