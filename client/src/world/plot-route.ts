import type { Plot } from './layout';
import type { WalkGrid } from './walk-grid';
import { walkPath, type GroundPoint } from './walk-tour';

/** Metres in front of a plot's prop the player stands, and how close a leg's end counts as reached. */
export const STAND_OFF = 1.6;
const LEG = 1.2;
const STAND = 0.4;

/** A walk from `from` over paths and bridges to the spot in front of `plot`, then a step towards its prop; null when no walk gets there. */
export function plotRoute(grid: WalkGrid, from: GroundPoint, plot: Plot): { x: number; z: number; r: number }[] | null {
  const stand = { x: plot.x + Math.sin(plot.facing) * STAND_OFF, z: plot.z + Math.cos(plot.facing) * STAND_OFF };
  let legs: GroundPoint[];
  try {
    legs = walkPath(grid, from, [stand]);
  } catch {
    return null;
  }
  const route = legs.map((p) => ({ x: p.x, z: p.z, r: LEG }));
  route[route.length - 1] = { ...stand, r: STAND };
  route.push({ x: plot.x, z: plot.z, r: STAND_OFF - 0.3 });
  return route;
}
