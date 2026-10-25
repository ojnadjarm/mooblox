/** Pure timetables for NPC kids: walkers stop and look round at each end of their path or visit a stall or sign near it, players hop now and then. */

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

/** Sights within this many metres of a path end may get a visit; walkers stand this far off a sight's rim. */
const VISIT_REACH = 6;
const VISIT_GAP = 0.7;

/**
 * A path walk with a visit at each end where a sight is near: A, (stand at a sight, look), A, B, (sight), B, back to A.
 * The detour must clear every other obstacle by 0.3 m; `pause` is the stand at a bare end, a visit stands 1.6x as long.
 */
export function walkerRoute(ax: number, az: number, bx: number, bz: number, sights: readonly Sight[], obstacles: readonly { x: number; z: number; r: number }[], speed: number, pause: number): Route {
  const xs: number[] = [];
  const zs: number[] = [];
  const dwell: number[] = [];
  const look: number[] = [];
  for (const [ex, ez] of [[bx, bz], [ax, az]] as const) {
    let best = -1;
    let bestD = VISIT_REACH;
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < sights.length; i++) {
      const s = sights[i]!;
      const d = Math.hypot(s.x - ex, s.z - ez);
      if (d - s.r - VISIT_GAP >= bestD || d < 1e-6) continue;
      const k = (s.r + VISIT_GAP) / d;
      const px = s.x + (ex - s.x) * k;
      const pz = s.z + (ez - s.z) * k;
      if (!clear(ex, ez, px, pz, obstacles, s)) continue;
      best = i;
      bestD = d - s.r - VISIT_GAP;
      sx = px;
      sz = pz;
    }
    xs.push(ex);
    zs.push(ez);
    if (best < 0) {
      dwell.push(pause);
      look.push(-1);
      continue;
    }
    dwell.push(0);
    look.push(-1);
    xs.push(sx, ex);
    zs.push(sz, ez);
    dwell.push(pause * 1.6, 0);
    look.push(best, -1);
  }
  return loop(xs, zs, dwell, look, speed);
}

/** True when the walk from (ax, az) to (bx, bz) keeps 0.3 m off every obstacle except the sights' own. */
function clear(ax: number, az: number, bx: number, bz: number, obstacles: readonly { x: number; z: number; r: number }[], own: Sight, from?: Sight): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  for (const o of obstacles) {
    if (Math.hypot(o.x - own.x, o.z - own.z) < 0.5 || (from && Math.hypot(o.x - from.x, o.z - from.z) < 0.5)) continue;
    const u = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / l2));
    if (Math.hypot(ax + dx * u - o.x, az + dz * u - o.z) < o.r + 0.3) return false;
  }
  return true;
}

/** Sights a stroller links in one loop, and how far apart (m) two linked sights may stand. */
const STROLL_SIGHTS = 3;
const STROLL_REACH = 24;

/**
 * A stroll from sight `first` to the nearest unvisited sights in reach (clear walks only), up to three, and back round: at each it
 * stands off the rim on the side it came from and looks. Null when no second sight is in reach.
 */
export function strollRoute(first: number, sights: readonly Sight[], obstacles: readonly { x: number; z: number; r: number }[], speed: number, pause: number): Route | null {
  const order = [first];
  const xs: number[] = [];
  const zs: number[] = [];
  let cx = sights[first]!.x;
  let cz = sights[first]!.z;
  while (order.length < STROLL_SIGHTS) {
    let best = -1;
    let bestD = STROLL_REACH;
    for (let i = 0; i < sights.length; i++) {
      if (order.includes(i)) continue;
      const s = sights[i]!;
      const d = Math.hypot(s.x - cx, s.z - cz);
      if (d >= bestD || d < 1e-6) continue;
      const k = (s.r + VISIT_GAP) / d;
      if (!clear(cx, cz, s.x + (cx - s.x) * k, s.z + (cz - s.z) * k, obstacles, s, sights[order[order.length - 1]!]!)) continue;
      best = i;
      bestD = d;
    }
    if (best < 0) break;
    order.push(best);
    cx = sights[best]!.x;
    cz = sights[best]!.z;
  }
  if (order.length < 2) return null;
  for (let k = 0; k < order.length; k++) {
    const s = sights[order[k]!]!;
    const prev = sights[order[(k + order.length - 1) % order.length]!]!;
    const d = Math.hypot(prev.x - s.x, prev.z - s.z) || 1;
    xs.push(s.x + ((prev.x - s.x) * (s.r + VISIT_GAP)) / d);
    zs.push(s.z + ((prev.z - s.z) * (s.r + VISIT_GAP)) / d);
  }
  return loop(xs, zs, order.map(() => pause * 1.6), order, speed);
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
