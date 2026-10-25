import type { WorldLayout } from './layout';
import type { WalkGrid } from './walk-grid';

/** A point on the ground plane (metres). */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

const CLEAR = 2;
const STEP = 0.25;

/** Walkable cells at least CLEAR cells from any unwalkable one (a margin round solids, rims and deck edges). */
function clearCells(grid: WalkGrid): Uint8Array {
  const { w, h } = grid;
  const out = new Uint8Array(w * h);
  for (let j = CLEAR; j < h - CLEAR; j++) {
    for (let i = CLEAR; i < w - CLEAR; i++) {
      let ok = 1;
      for (let dj = -CLEAR; ok && dj <= CLEAR; dj++) for (let di = -CLEAR; ok && di <= CLEAR; di++) ok = grid.grid[(j + dj) * w + i + di]!;
      out[j * w + i] = ok;
    }
  }
  return out;
}

/** 8-way BFS over `cells` from `start`: the previous cell of each reached cell (-1 at the start, -2 unreached). */
function search(cells: Uint8Array, w: number, start: number): Int32Array {
  const prev = new Int32Array(cells.length).fill(-2);
  const queue = new Int32Array(cells.length);
  let [head, tail] = [0, 0];
  prev[start] = -1;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++]!;
    const x = c % w;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = c + dz * w + dx;
        if ((dx || dz) && x + dx >= 0 && x + dx < w && n >= 0 && n < cells.length && cells[n] && prev[n] === -2) {
          prev[n] = c;
          queue[tail++] = n;
        }
      }
    }
  }
  return prev;
}

/** Whether the straight line a-b stays on `cells`. */
function clearLine(grid: WalkGrid, cells: Uint8Array, a: GroundPoint, b: GroundPoint): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP);
  for (let k = 1; k < n; k++) if (!cells[grid.cell(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n)]) return false;
  return true;
}

/**
 * Waypoints of a walk from `from` through every goal over the walkable cells: shortest cell path kept off solids and rims
 * (plain walkable cells where that margin cuts a goal off), then string-pulled to the fewest straight legs. Throws when a goal
 * is unreachable.
 */
export function walkPath(grid: WalkGrid, from: GroundPoint, goals: readonly GroundPoint[]): GroundPoint[] {
  const clear = clearCells(grid);
  const out: GroundPoint[] = [];
  let at = from;
  for (const goal of goals) {
    let cells = clear;
    const start = grid.cell(at.x, at.z);
    const end = grid.cell(goal.x, goal.z);
    let prev = cells[start] ? search(cells, grid.w, start) : null;
    if (!prev || prev[end] === -2) {
      cells = grid.grid;
      prev = search(cells, grid.w, start);
    }
    if (prev[end] === -2) throw new Error(`no walk to ${goal.x.toFixed(1)}, ${goal.z.toFixed(1)}`);
    const chain: GroundPoint[] = [];
    for (let c = end; c >= 0; c = prev[c]!) chain.push(grid.point(c));
    chain.reverse();
    chain[chain.length - 1] = goal;
    let anchor = at;
    for (let k = 1; k < chain.length; k++) {
      if (!clearLine(grid, cells, anchor, chain[k]!)) {
        anchor = chain[k - 1]!;
        out.push(anchor);
      }
    }
    out.push(goal);
    at = goal;
  }
  return out;
}

/** A tour stop: the plot walked to. */
export interface TourStop extends GroundPoint {
  readonly activityId: number;
  readonly radius: number;
}

/**
 * A tour over several bridges within a walk of about `reach` metres per stop: the entry plots (nearest their bridge) of the
 * `near` districts closest to the start by walk, nearest next first, then that of the farthest district within `reach` of the
 * start. On one hub it crosses into and out of each district; on an archipelago the last stop also crosses plaza links.
 */
export function tourGoals(layout: WorldLayout, grid: WalkGrid, from: GroundPoint, near = 2, reach = 150): TourStop[] {
  const prev = search(grid.grid, grid.w, grid.cell(from.x, from.z));
  const metres = (c: number): number => {
    let n = 0;
    for (; c >= 0; c = prev[c]!) n++;
    return c === -2 ? -1 : n * grid.cellSize;
  };
  const entries = layout.zones
    .filter((z) => z.plots.length > 0)
    .map((z) => z.plots.reduce((a, b) => (Math.hypot(b.x - z.anchor.x, b.z - z.anchor.z) < Math.hypot(a.x - z.anchor.x, a.z - z.anchor.z) ? b : a)))
    .map((p) => ({ stop: { activityId: p.activityId, x: p.x, z: p.z, radius: p.radius }, d: metres(grid.cell(p.x, p.z)) }))
    .filter((e) => e.d > 0)
    .sort((a, b) => a.d - b.d);
  const far = entries.filter((e) => e.d <= reach).at(-1) ?? entries.at(-1);
  if (!far) return [];
  const pool = entries.filter((e) => e !== far).slice(0, near).map((e) => e.stop);
  const tour: TourStop[] = [];
  let at = from;
  while (pool.length) {
    let k = 0;
    pool.forEach((p, i) => {
      if (Math.hypot(p.x - at.x, p.z - at.z) < Math.hypot(pool[k]!.x - at.x, pool[k]!.z - at.z)) k = i;
    });
    at = pool.splice(k, 1)[0]!;
    tour.push(at as TourStop);
  }
  tour.push(far.stop);
  return tour;
}
