import { inOpening, toArch } from './portal-arch';

/** Where everything stands in the hub (metres, y up, north = -z). Pure data shared by the scene, the triggers and the tests. */

/** Pads on one floor, as a Crash Bandicoot warp room. */
export const PADS_PER_FLOOR = 5;

export const HUB = {
  /** The hub island. */
  radius: 27,
  /** The balustrade ring round the walkable floor. */
  wall: 25,
  /** Centre lift between floors. */
  lift: { x: 0, z: 0, r: 2.4 },
  /** Pad ring radius and the pads' spread either side of north. */
  padRing: 15,
  padSpread: (60 * Math.PI) / 180,
  padRadius: 1.9,
  /** The portal arch stands this far behind its pad. */
  archBack: 3.2,
  /** Trophy hall site on the south side, open towards the centre. */
  hall: { x: 0, z: 15, r: 5, face: Math.PI },
  /** The four show-off displays (gems, crystals, stars, level) on the south arc. */
  displayRing: 14,
  displayAngles: [(125 * Math.PI) / 180, (148 * Math.PI) / 180, (212 * Math.PI) / 180, (235 * Math.PI) / 180],
} as const;

/** A point on the ground with the yaw its front (+z) faces. */
export interface Spot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/** Bearing (radians from north, clockwise seen from above) to a ground point at `distance` from the centre. */
const at = (bearing: number, distance: number): { x: number; z: number } => ({ x: Math.sin(bearing) * distance, z: -Math.cos(bearing) * distance });

/** Yaw that turns a front (+z) at (x, z) towards the centre. */
const towardsCentre = (x: number, z: number): number => Math.atan2(-x, -z);

/** The five pads of a floor, west to east across the north arc, each facing the centre. */
export function padSpots(): Spot[] {
  return Array.from({ length: PADS_PER_FLOOR }, (_, i) => {
    const bearing = -HUB.padSpread + (i * 2 * HUB.padSpread) / (PADS_PER_FLOOR - 1);
    const p = at(bearing, HUB.padRing);
    return { ...p, yaw: towardsCentre(p.x, p.z) };
  });
}

/** The arch behind each pad, facing the centre. */
export function archSpots(): Spot[] {
  return padSpots().map((p) => {
    const d = HUB.padRing + HUB.archBack;
    const k = d / HUB.padRing;
    return { x: p.x * k, z: p.z * k, yaw: p.yaw };
  });
}

/** The show-off displays, facing the centre. */
export function displaySpots(): Spot[] {
  return HUB.displayAngles.map((a) => {
    const p = at(a, HUB.displayRing);
    return { ...p, yaw: towardsCentre(p.x, p.z) };
  });
}

/** Floors needed for `count` courses (one even when empty). */
export const floorCount = (count: number): number => Math.max(1, Math.ceil(count / PADS_PER_FLOOR));

/** The floor and pad of the course at `index` in pad order. */
export const padOf = (index: number): { floor: number; pad: number } => ({ floor: Math.floor(index / PADS_PER_FLOOR), pad: index % PADS_PER_FLOOR });

/** The courses on `floor`, in pad order (fewer than five on the last floor). */
export function floorCourses<T>(courses: readonly T[], floor: number): T[] {
  return courses.slice(floor * PADS_PER_FLOOR, (floor + 1) * PADS_PER_FLOOR);
}

/** Where the kid starts: on the lift's south side behind its floor number, facing the pads, or back in front of the pad of the course they came from. */
export function spawnSpot(pad: number | null): Spot {
  if (pad === null) return { x: HUB.lift.x, z: HUB.lift.z + 1.5, yaw: Math.PI };
  const p = padSpots()[pad]!;
  const k = (HUB.padRing - HUB.padRadius - 1.6) / HUB.padRing;
  return { x: p.x * k, z: p.z * k, yaw: towardsCentre(p.x, p.z) };
}

/** Index of the arch whose portal fluid a body at (x, y, z) has stepped into, or -1. */
export function portalAt(x: number, y: number, z: number): number {
  return archSpots().findIndex((a) => {
    const l = toArch(a.x, a.z, a.yaw, x, y, z);
    return inOpening(l.x, l.y, l.z);
  });
}

/** Whether (x, z) stands on the lift. */
export const onLift = (x: number, z: number): boolean => Math.hypot(HUB.lift.x - x, HUB.lift.z - z) <= HUB.lift.r - 0.5;
