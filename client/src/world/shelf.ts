import { BufferAttribute, BufferGeometry, Color } from 'three';

/**
 * A broad terrace shelf (art bible §3, district concept): the cap of an island beyond a curved stone wall, raised as one upper
 * level. Island-local (island centre at 0, 0, radius `rim`); `at` is the bearing (x = cos, z = sin) of the shelf's middle,
 * `edge` the distance from the island centre to the wall at that bearing, `radius` the curvature of the wall.
 */
export interface Shelf {
  readonly rim: number;
  readonly at: number;
  readonly edge: number;
  readonly radius: number;
}

/** Centre of the circle whose arc is the shelf wall. */
export function shelfCentre(s: Shelf): { x: number; z: number } {
  const d = s.edge + s.radius;
  return { x: Math.cos(s.at) * d, z: Math.sin(s.at) * d };
}

/** Whether (x, z) lies on the shelf, `inset` metres in from both its wall and the island rim. */
export function onShelf(s: Shelf, x: number, z: number, inset = 0): boolean {
  const c = shelfCentre(s);
  return Math.hypot(x, z) <= s.rim - inset && Math.hypot(x - c.x, z - c.z) <= s.radius - inset;
}

/**
 * Half the angle each arc spans where wall and rim meet: `wall` round the wall circle's centre (measured from the bearing
 * back towards the island centre), `rim` round the island centre.
 */
export function shelfArcs(s: Shelf): { wall: number; rim: number } {
  const d = s.edge + s.radius;
  const clamp = (v: number) => Math.min(1, Math.max(-1, v));
  return {
    wall: Math.acos(clamp((s.radius * s.radius + d * d - s.rim * s.rim) / (2 * s.radius * d))),
    rim: Math.acos(clamp((s.rim * s.rim + d * d - s.radius * s.radius) / (2 * s.rim * d))),
  };
}

/** The shelf outline (convex: two circle arcs) with its wall pushed `wall` metres and its rim `rim` metres outwards. */
export function shelfOutline(s: Shelf, wall = 0, rim = 0, steps = 24): { x: number; z: number }[] {
  const c = shelfCentre(s);
  const g: Shelf = { rim: s.rim + rim, at: s.at, edge: s.edge - wall, radius: s.radius + wall };
  const arcs = shelfArcs(g);
  const pts: { x: number; z: number }[] = [];
  const back = s.at + Math.PI;
  for (let i = 0; i <= steps; i++) {
    const a = back - arcs.wall + (2 * arcs.wall * i) / steps;
    pts.push({ x: c.x + Math.cos(a) * g.radius, z: c.z + Math.sin(a) * g.radius });
  }
  for (let i = 1; i < steps; i++) {
    const a = s.at - arcs.rim + (2 * arcs.rim * i) / steps;
    pts.push({ x: Math.cos(a) * g.rim, z: Math.sin(a) * g.rim });
  }
  return pts;
}

/** Ground area of the shelf (m²): the two circle segments the outline closes. */
export function shelfArea(s: Shelf): number {
  const { wall, rim } = shelfArcs(s);
  const segment = (r: number, half: number) => r * r * (half - Math.sin(2 * half) / 2);
  return segment(s.radius, wall) + segment(s.rim, rim);
}

/** Points over the shelf every `step` metres, `inset` in from its edges (for clearance checks and footprints). */
export function shelfSamples(s: Shelf, step: number, inset: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const ux = Math.cos(s.at);
  const uz = Math.sin(s.at);
  for (let d = s.edge + inset; d <= s.rim - inset; d += step) {
    for (let t = 0; t <= s.rim; t += step) {
      for (const side of t === 0 ? [0] : [-1, 1]) {
        const x = ux * d - uz * t * side;
        const z = uz * d + ux * t * side;
        if (onShelf(s, x, z, inset)) out.push({ x, z });
      }
    }
  }
  return out;
}

/**
 * The broadest clear shelf at bearing `at`: for each wall curvature from flat to round, the wall distance from `near` out to
 * `far` (0.5 m steps) is binary-searched for the nearest clear one (a farther wall leaves a smaller cap), and the cap with the
 * most area whose every sample point and wall foot (0.4 m out) is clear (`blocked` false) wins; null when none is clear.
 */
export function shelfSite(rim: number, at: number, near: number, far: number, blocked: (x: number, z: number) => boolean): Shelf | null {
  const lo = Math.max(0, near);
  const steps = Math.floor((far - lo) / 0.5 + 1e-6);
  if (steps < 0) return null;
  let best: Shelf | null = null;
  let area = 0;
  for (const k of [2.5, 1.5, 1, 0.7, 0.5, 0.4]) {
    const site = (i: number): Shelf => {
      const edge = lo + i * 0.5;
      return { rim, at, edge, radius: Math.max(k * rim, (rim - edge) / 2 + 1) };
    };
    const clear = (t: Shelf) => !shelfOutline(t, 0.4, 0, 48).some((p) => blocked(p.x, p.z)) && !shelfSamples(t, 1.2, 0.2).some((p) => blocked(p.x, p.z));
    if (shelfArea(site(0)) <= area || !clear(site(steps))) continue;
    let [a, b] = [0, steps];
    while (a < b) {
      const m = (a + b) >> 1;
      if (clear(site(m))) b = m;
      else a = m + 1;
    }
    const s = site(a);
    const sa = shelfArea(s);
    if (sa > area) [best, area] = [s, sa];
  }
  return best;
}

/** A flat-topped prism over a convex outline from y0 to y1 in one colour (top and sides, bottom open). */
export function outlinePrism(pts: readonly { x: number; z: number }[], y0: number, y1: number, colour: number): BufferGeometry {
  const pos: number[] = [];
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x / pts.length;
    cz += p.z / pts.length;
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    // Outline runs counter-clockwise seen from +y in (x, z), so the top winds (centre, b, a) and the side (a, b) outward.
    const ccw = (a.x - cx) * (b.z - cz) - (a.z - cz) * (b.x - cx) > 0;
    const [p, q] = ccw ? [a, b] : [b, a];
    pos.push(cx, y1, cz, q.x, y1, q.z, p.x, y1, p.z);
    pos.push(p.x, y0, p.z, p.x, y1, p.z, q.x, y1, q.z, p.x, y0, p.z, q.x, y1, q.z, q.x, y0, q.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const c = new Color(colour);
  const col = new Float32Array(pos.length);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
