import type { Collectible, CollectibleKind } from '../domain/rewards';
import type { QualityTier } from '../perf/quality';
import type { WorldLayout, Zone } from './layout';
import { Occupancy, type GroundQuery } from './occupancy';
import { seededRandom } from './random';

/** Where one collectible floats on the ground plane. */
export interface CollectibleSpot {
  readonly key: string;
  readonly kind: CollectibleKind;
  readonly sectionId: number;
  readonly x: number;
  readonly z: number;
}

/** Whether the player can walk from the spawn to a point (`WalkGrid`). */
export interface Reachability {
  reachable(x: number, z: number): boolean;
}

export type CollectibleItem = Pick<Collectible, 'key' | 'kind' | 'sectionId' | 'cmId'>;

/** How many collectibles each tier shows and how far away (gamification plan section 8). */
export const COLLECTIBLE_TIERS: Readonly<Record<QualityTier, { readonly max: number; readonly distance: number }>> = {
  low: { max: 40, distance: 40 },
  medium: { max: 80, distance: 60 },
  high: { max: 150, distance: 80 },
  xhigh: { max: 300, distance: 120 },
};

/** Clearance round a collectible. */
export const COLLECTIBLE_R = 0.8;
const TRIES = 24;

/** FNV-1a hash of a key. */
function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Seeded spots for collectibles: gems round their activity's plot, crystals at their district's centre, stars anywhere in
 * it; each spot is clear of every placed model, plot and other collectible and reachable from the spawn. Districts are
 * placed independently, so a course change only moves the collectibles of the districts it touched.
 */
export function placeCollectibles(layout: WorldLayout, ground: GroundQuery, walk: Reachability, courseId: number, items: readonly CollectibleItem[]): CollectibleSpot[] {
  const zones = new Map(layout.zones.map((z) => [z.sectionId, z]));
  const bySection = new Map<number, CollectibleItem[]>();
  for (const it of items) {
    if (!zones.has(it.sectionId)) continue;
    const list = bySection.get(it.sectionId);
    if (list) list.push(it);
    else bySection.set(it.sectionId, [it]);
  }
  const spots: CollectibleSpot[] = [];
  for (const [sectionId, list] of bySection) {
    const zone = zones.get(sectionId)!;
    const taken = new Occupancy();
    for (const p of zone.plots) taken.add(p.x, p.z, p.radius);
    const ok = (x: number, z: number) => Math.hypot(x - zone.x, z - zone.z) <= zone.radius - 1.5 && !ground.hits(x, z, COLLECTIBLE_R) && !taken.hits(x, z, COLLECTIBLE_R) && walk.reachable(x, z);
    for (const it of [...list].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
      const spot = pick(zone, it, courseId, ok);
      if (!spot) continue;
      taken.add(spot[0], spot[1], COLLECTIBLE_R);
      spots.push({ key: it.key, kind: it.kind, sectionId, x: spot[0], z: spot[1] });
    }
  }
  return spots;
}

function pick(zone: Zone, it: CollectibleItem, courseId: number, ok: (x: number, z: number) => boolean): [number, number] | null {
  const random = seededRandom((courseId ^ hashKey(it.key)) >>> 0);
  const plot = it.cmId === null ? undefined : zone.plots.find((p) => p.activityId === it.cmId);
  if (it.kind === 'crystal' && ok(zone.x, zone.z)) return [zone.x, zone.z];
  for (let i = 0; i < TRIES; i++) {
    const a = random() * 2 * Math.PI;
    let d: number;
    let [cx, cz] = [zone.x, zone.z];
    if (plot) {
      [cx, cz] = [plot.x, plot.z];
      d = plot.radius + COLLECTIBLE_R + 0.2 + random() * 2.5;
    } else if (it.kind === 'crystal') d = random() * zone.radius * 0.5;
    else d = Math.sqrt(random()) * (zone.radius - 1.5);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (ok(x, z)) return [x, z];
  }
  // Crowded district: the nearest free cell to the wanted centre on a 0.5 m spiral.
  const [cx, cz] = plot ? [plot.x, plot.z] : [zone.x, zone.z];
  for (let ring = 1; ring * 0.5 <= zone.radius * 2; ring++) {
    const n = Math.max(8, Math.round(ring * 2 * Math.PI));
    const start = random() * 2 * Math.PI;
    for (let k = 0; k < n; k++) {
      const a = start + (k / n) * 2 * Math.PI;
      const x = cx + Math.cos(a) * ring * 0.5;
      const z = cz + Math.sin(a) * ring * 0.5;
      if (ok(x, z)) return [x, z];
    }
  }
  return null;
}

/**
 * Writes into `out` the indices of the spots a tier shows near (x, z): within its distance, nearest first, at most its
 * cap; returns the count.
 */
export function visibleSpots(spots: readonly CollectibleSpot[], x: number, z: number, tier: QualityTier, out: Int32Array, dist: Float32Array): number {
  const { max, distance } = COLLECTIBLE_TIERS[tier];
  let n = 0;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]!;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d > distance) continue;
    // Insertion into the sorted prefix, dropping the farthest past the cap.
    let j = Math.min(n, max - 1);
    if (n >= max && d >= dist[max - 1]!) continue;
    while (j > 0 && dist[j - 1]! > d) {
      dist[j] = dist[j - 1]!;
      out[j] = out[j - 1]!;
      j--;
    }
    dist[j] = d;
    out[j] = i;
    if (n < max) n++;
  }
  return n;
}
