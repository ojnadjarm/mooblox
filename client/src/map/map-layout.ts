import type { Circle } from '../world/layout';

/** Sizes of the course map (metres). */
export const MAP = {
  /** The home island in the middle (the spawn plaza look). */
  home: 13,
  /** Every course island. */
  island: 13,
  /** Open water between two islands' rims. */
  gap: 9,
} as const;

/** The course map: the home island, one island per course (course order) and the circle holding them all. */
export interface MapLayout {
  readonly home: Circle;
  readonly islands: readonly Circle[];
  readonly extent: number;
}

/**
 * Islands on rings round the home island: ring k sits one pitch (2 radii + gap) further out and takes as many islands as fit
 * a pitch apart along it; the last ring spreads its islands evenly. Each ring turns a little, so rings do not line up.
 */
export function mapLayout(count: number): MapLayout {
  const pitch = 2 * MAP.island + MAP.gap;
  const home = { x: 0, z: 0, radius: MAP.home };
  const islands: Circle[] = [];
  let r = MAP.home + MAP.island + MAP.gap;
  for (let ring = 0; islands.length < count; ring++, r += pitch) {
    const fit = Math.floor(Math.PI / Math.asin(Math.min(1, pitch / (2 * r))));
    const take = Math.min(fit, count - islands.length);
    const turn = ring * 0.9 + (take === 1 ? Math.PI * 0.75 : 0);
    for (let i = 0; i < take; i++) {
      const a = turn + (i / take) * Math.PI * 2;
      islands.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, radius: MAP.island });
    }
  }
  const extent = islands.reduce<number>((e, c) => Math.max(e, Math.hypot(c.x, c.z) + c.radius), home.radius);
  return { home, islands, extent };
}

/** Index of the island under a ground point (x, z), or -1. */
export function islandAt(islands: readonly Circle[], x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  islands.forEach((c, i) => {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d <= c.radius + 1.5 && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** The island to move to from `from` with an arrow key: nearest whose bearing lies within 60 degrees of (dx, dz); wraps in order when none. */
export function neighbour(islands: readonly Circle[], from: number, dx: number, dz: number): number {
  if (!islands.length) return -1;
  const at = islands[from];
  if (!at) return 0;
  let best = -1;
  let bestD = Infinity;
  islands.forEach((c, i) => {
    if (i === from) return;
    const vx = c.x - at.x;
    const vz = c.z - at.z;
    const d = Math.hypot(vx, vz);
    if ((vx * dx + vz * dz) / d < 0.5) return;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  if (best >= 0) return best;
  return (from + (dx + dz > 0 ? 1 : islands.length - 1)) % islands.length;
}
