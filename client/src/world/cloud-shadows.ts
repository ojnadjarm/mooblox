import type { Circle } from './layout';
import { seededRandom } from './random';

/** A cloud shadow on the sea: centre on a ring round the origin (radius m, angle rad), half-lengths along and across the ring (m). */
export interface CloudShadow {
  readonly radius: number;
  readonly angle: number;
  readonly along: number;
  readonly across: number;
}

export const SHADOW_COUNT = 7;
/** Radians per second the shadows turn round the archipelago, drifting like the clouds. */
export const SHADOW_TURN = 0.003;
/** Multiplier on the sea colour under a full shadow (cooler and darker, as the concept's deep-sea shadows). */
export const SHADOW_TINT: readonly [number, number, number] = [0.4, 0.5, 0.68];
/** How much of the tint a full shadow takes. */
export const SHADOW_STRENGTH = 0.9;

/** Cloud shadows for the sea round these islands: one per sector of a ring past the outer shores, each about 2:1 along it. */
export function cloudShadows(islands: readonly Circle[], seed = 11): CloudShadow[] {
  const reach = Math.max(40, ...islands.map((c) => Math.hypot(c.x, c.z) + c.radius));
  const rand = seededRandom(seed);
  const start = rand() * Math.PI * 2;
  return Array.from({ length: SHADOW_COUNT }, (_, i) => {
    const along = reach * (0.3 + rand() * 0.14);
    return {
      radius: reach * (0.75 + rand() * 0.5),
      angle: start + ((i + (rand() - 0.5) * 0.6) * Math.PI * 2) / SHADOW_COUNT,
      along,
      across: along * (0.5 + rand() * 0.15),
    };
  });
}

/** Shadow cover 0..1 at a sea point when the ring has turned by `turn` radians (soft edge, no noise). */
export function shadeAt(shadows: readonly CloudShadow[], x: number, z: number, turn = 0): number {
  let s = 0;
  for (const c of shadows) {
    const ca = Math.cos(c.angle + turn);
    const sa = Math.sin(c.angle + turn);
    const dx = x - ca * c.radius;
    const dz = z - sa * c.radius;
    const r = Math.hypot((dz * ca - dx * sa) / c.along, (dx * ca + dz * sa) / c.across);
    s = Math.max(s, 1 - smooth(Math.min(1, Math.max(0, (r - 0.8) / 0.2))));
  }
  return s;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
