/** Pure timetables for NPC kids: walkers stop and look round at each end of their path and visit a stall or sign near it, players hop now and then. */

/** Hop height (m) of a playing kid: a 0.45 s arc, 0.9 m high, once every `period` seconds. */
export function hop(t: number, period: number): number {
  const s = ((t % period) + period) % period;
  const u = s / 0.45;
  return u < 1 ? 3.6 * u * (1 - u) : 0;
}

/** Something a walker stops to look at: a stall or a sign, its centre, ground radius and how high the eyes go (m above eye level). */
export interface Sight {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly up: number;
}

/** A looped walker route: stops (x, z), seconds stood at each, the sight looked at there (-1 = look round), arrival times and the loop length. */
export interface Route {
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly dwell: Float64Array;
  readonly sight: Int32Array;
  readonly at: Float64Array;
  readonly cycle: number;
}

/** Where a route walker is: position, the heading it wants, whether it walks, and the sight it looks at (-1 none). */
export interface RoutePose {
  x: number;
  z: number;
  heading: number;
  walking: boolean;
  sight: number;
}

/** Sights within this many metres (rim to path) may get a visit; walkers stand this far off a sight's rim. */
const VISIT_REACH = 12;
const VISIT_GAP = 0.7;
/** Walks keep this far (m) off obstacles; a bend round one passes this much wider, the nearest that clears. */
const CLEARANCE = 0.3;
const BEND_WIDE = [0.4, 1.2, 2.4];

type Obstacles = readonly { readonly x: number; readonly z: number; readonly r: number }[];

/**
 * A path walk with a visit on each leg where a sight is near the path: A, (leave the path, stand at a sight, look), B, the same back
 * to A with another sight. The detour leaves the path at its point nearest the sight and cuts back to the leg's end, bending once
 * round an obstacle in the way when that clears; `pause` is the stand at each end, a visit stands 1.6x as long.
 */
export function walkerRoute(ax: number, az: number, bx: number, bz: number, sights: readonly Sight[], obstacles: Obstacles, speed: number, pause: number): Route {
  const xs: number[] = [];
  const zs: number[] = [];
  const dwell: number[] = [];
  const look: number[] = [];
  let used = -1;
  for (const [fx, fz, ex, ez] of [[ax, az, bx, bz], [bx, bz, ax, az]] as const) {
    const dx = ex - fx;
    const dz = ez - fz;
    const l2 = dx * dx + dz * dz || 1;
    let best = -1;
    let bestD = VISIT_REACH;
    let legs: number[] = [];
    let standAt = -1;
    for (let i = 0; i < sights.length; i++) {
      if (i === used) continue;
      const s = sights[i]!;
      const u = Math.max(0, Math.min(1, ((s.x - fx) * dx + (s.z - fz) * dz) / l2));
      const qx = fx + dx * u;
      const qz = fz + dz * u;
      const d = Math.hypot(s.x - qx, s.z - qz);
      if (d - s.r - VISIT_GAP >= bestD || d < 1e-6) continue;
      const k = (s.r + VISIT_GAP) / d;
      const tx = s.x + (qx - s.x) * k;
      const tz = s.z + (qz - s.z) * k;
      const into = bend(qx, qz, tx, tz, obstacles);
      const back = into && bend(tx, tz, ex, ez, obstacles);
      if (!into || !back) continue;
      best = i;
      bestD = d - s.r - VISIT_GAP;
      legs = Math.hypot(qx - fx, qz - fz) > 0.5 ? [qx, qz, ...into, tx, tz, ...back] : [...into, tx, tz, ...back];
      standAt = legs.length - back.length - 2;
    }
    if (best >= 0) {
      used = best;
      for (let j = 0; j < legs.length; j += 2) {
        xs.push(legs[j]!);
        zs.push(legs[j + 1]!);
        dwell.push(j === standAt ? pause * 1.6 : 0);
        look.push(j === standAt ? best : -1);
      }
    }
    xs.push(ex);
    zs.push(ez);
    dwell.push(pause);
    look.push(-1);
  }
  return loop(xs, zs, dwell, look, speed);
}
/** The first obstacle the walk from (ax, az) to (bx, bz) passes within `CLEARANCE` of, or null when clear. */
function blocker(ax: number, az: number, bx: number, bz: number, obstacles: Obstacles): Obstacles[number] | null {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let first: Obstacles[number] | null = null;
  let firstU = Infinity;
  for (const o of obstacles) {
    const u = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / l2));
    if (u < firstU && Math.hypot(ax + dx * u - o.x, az + dz * u - o.z) < o.r + CLEARANCE) {
      first = o;
      firstU = u;
    }
  }
  return first;
}

/** The way from (ax, az) to (bx, bz): [] when the line is clear, [x, z] of one bend beside the first obstacle in it, or null. */
function bend(ax: number, az: number, bx: number, bz: number, obstacles: Obstacles): number[] | null {
  const o = blocker(ax, az, bx, bz, obstacles);
  if (!o) return [];
  const l = Math.hypot(bx - ax, bz - az) || 1;
  const nx = -(bz - az) / l;
  const nz = (bx - ax) / l;
  for (const wide of BEND_WIDE) {
    const m = o.r + CLEARANCE + wide;
    let out: number[] | null = null;
    let shortest = Infinity;
    for (const side of [-1, 1]) {
      const wx = o.x + nx * side * m;
      const wz = o.z + nz * side * m;
      const len = Math.hypot(wx - ax, wz - az) + Math.hypot(bx - wx, bz - wz);
      if (len < shortest && !blocker(ax, az, wx, wz, obstacles) && !blocker(wx, wz, bx, bz, obstacles)) {
        out = [wx, wz];
        shortest = len;
      }
    }
    if (out) return out;
  }
  return null;
}

/** Where a visitor stands at sight `s` coming from (fx, fz): off its rim on that side. */
function standOff(s: Sight, fx: number, fz: number): [number, number] {
  const d = Math.hypot(fx - s.x, fz - s.z) || 1;
  return [s.x + ((fx - s.x) * (s.r + VISIT_GAP)) / d, s.z + ((fz - s.z) * (s.r + VISIT_GAP)) / d];
}

/** Sights a stroller links in one loop, and how far apart (m) two linked sights may stand. */
const STROLL_SIGHTS = 3;
const STROLL_REACH = 24;

/**
 * A stroll from sight `first` to the nearest unvisited sights in reach (walkable with at most one bend, the walk home too), up to
 * three, and back round: at each it stands off the rim on the side it came from and looks. Null when no second sight is in reach.
 */
export function strollRoute(first: number, sights: readonly Sight[], obstacles: Obstacles, speed: number, pause: number): Route | null {
  const order = [first];
  let cx = sights[first]!.x;
  let cz = sights[first]!.z;
  while (order.length < STROLL_SIGHTS) {
    let best = -1;
    let bestD = STROLL_REACH;
    const last = sights[order[order.length - 1]!]!;
    for (let i = 0; i < sights.length; i++) {
      if (order.includes(i)) continue;
      const s = sights[i]!;
      const d = Math.hypot(s.x - cx, s.z - cz);
      if (d >= bestD || d < 1e-6) continue;
      const [fx, fz] = order.length > 1 ? standOff(last, sights[order[order.length - 2]!]!.x, sights[order[order.length - 2]!]!.z) : standOff(last, s.x, s.z);
      const [tx, tz] = standOff(s, cx, cz);
      if (!bend(fx, fz, tx, tz, obstacles)) continue;
      if (order.length > 1) {
        const [hx, hz] = standOff(sights[first]!, s.x, s.z);
        if (!bend(tx, tz, hx, hz, obstacles)) continue;
      }
      best = i;
      bestD = d;
    }
    if (best < 0) break;
    order.push(best);
    cx = sights[best]!.x;
    cz = sights[best]!.z;
  }
  if (order.length < 2) return null;
  const n = order.length;
  const stand = order.map((k, j) => {
    const prev = sights[order[(j + n - 1) % n]!]!;
    return standOff(sights[k]!, prev.x, prev.z);
  });
  const xs: number[] = [];
  const zs: number[] = [];
  const dwell: number[] = [];
  const look: number[] = [];
  for (let j = 0; j < n; j++) {
    const [fx, fz] = stand[(j + n - 1) % n]!;
    const [tx, tz] = stand[j]!;
    const via = bend(fx, fz, tx, tz, obstacles) ?? [];
    for (let k = 0; k < via.length; k += 2) {
      xs.push(via[k]!);
      zs.push(via[k + 1]!);
      dwell.push(0);
      look.push(-1);
    }
    xs.push(tx);
    zs.push(tz);
    dwell.push(pause * 1.6);
    look.push(order[j]!);
  }
  return loop(xs, zs, dwell, look, speed);
}

/** A route through stops (x, z) with their stands and sights, timed at `speed`. */
function loop(xs: number[], zs: number[], dwell: number[], look: number[], speed: number): Route {
  const n = xs.length;
  const at = new Float64Array(n);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + n - 1) % n;
    t += Math.hypot(xs[i]! - xs[j]!, zs[i]! - zs[j]!) / speed;
    at[i] = t;
    t += dwell[i]!;
  }
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), dwell: Float64Array.from(dwell), sight: Int32Array.from(look), at, cycle: t };
}

/** Writes where a walker on `route` is at time t into `out` (no allocation): walking a leg, or standing at a stop. */
export function routeAt(route: Route, t: number, out: RoutePose): RoutePose {
  const n = route.at.length;
  const s = ((t % route.cycle) + route.cycle) % route.cycle;
  let i = 0;
  while (i < n - 1 && s >= route.at[i]! + route.dwell[i]!) i++;
  const j = (i + n - 1) % n;
  const fx = route.x[j]!;
  const fz = route.z[j]!;
  const tx = route.x[i]!;
  const tz = route.z[i]!;
  const start = j === n - 1 ? 0 : route.at[j]! + route.dwell[j]!;
  if (s < route.at[i]!) {
    const k = (s - start) / (route.at[i]! - start || 1);
    out.x = fx + (tx - fx) * k;
    out.z = fz + (tz - fz) * k;
    out.heading = Math.atan2(tx - fx, tz - fz);
    out.walking = true;
    out.sight = -1;
    return out;
  }
  out.x = tx;
  out.z = tz;
  out.walking = false;
  out.sight = route.sight[i]!;
  return out;
}
