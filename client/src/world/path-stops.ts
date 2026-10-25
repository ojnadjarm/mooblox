import type { Segment } from './dressing';

/** Kit models that walkers and strollers visit (stalls, signs, fountains): a stop is due where none stands near the path. */
export const SIGHT_IDS: ReadonlySet<string> = new Set(['town/stall-red', 'town/stall-green', 'nature/sign', 'town/fountain-round', 'town/fountain-round-detail']);

/** A point on a walk and the unit normal to its left. */
export interface PathPoint {
  readonly x: number;
  readonly z: number;
  readonly nx: number;
  readonly nz: number;
}

/** Points every `step` metres along each segment, `trim` metres in from both ends. */
export function pathPoints(segments: readonly Segment[], step: number, trim = 0): PathPoint[] {
  const out: PathPoint[] = [];
  for (const s of segments) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    if (len <= 2 * trim) continue;
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    for (let t = trim; t <= len - trim; t += step) out.push({ x: s.ax + ux * t, z: s.az + uz * t, nx: -uz, nz: ux });
  }
  return out;
}

/**
 * Wayside stops along walks (art bible §6, district concept): walking the points in order, a stop is tried wherever no sight
 * (given or placed) stands within `spacing`; `place` stands one beside the point and returns where, or null when it cannot.
 */
export function wayStops(points: readonly PathPoint[], sights: readonly { readonly x: number; readonly z: number }[], spacing: number, place: (p: PathPoint, n: number) => { x: number; z: number } | null): { x: number; z: number }[] {
  const seen = sights.map((s) => ({ x: s.x, z: s.z }));
  const out: { x: number; z: number }[] = [];
  for (const p of points) {
    if (seen.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < spacing)) continue;
    const at = place(p, out.length);
    if (!at) continue;
    seen.push(at);
    out.push(at);
  }
  return out;
}
