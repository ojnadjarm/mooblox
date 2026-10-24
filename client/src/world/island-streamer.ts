import type { Circle, WorldLayout } from './layout';
import type { StreamMetric } from './district-streamer';

/** A bridge between two islands (indices into the island list): straight, rim to rim along the centre line. */
export interface IslandBridge {
  readonly a: number;
  readonly b: number;
}

/** How near a bridge the player starts building the island across, and how close counts as standing on it. */
export interface IslandPolicy {
  /** Distance (m) from a bridge deck at which the island across starts to build. */
  readonly preload: number;
  /** Distance (m) from a bridge deck at which the island across is drawn at full detail. */
  readonly show: number;
  /** Margin (m) past the island circle that still counts as on the island (beach, shore fence). */
  readonly shore: number;
  /** Draw every bridge neighbour of the current island at full detail, not only the one ahead. */
  readonly neighbours: boolean;
}

/** The islands in district order (hubs, then zones) and every bridge between them. */
export function islandGraph(layout: WorldLayout): { islands: Circle[]; bridges: IslandBridge[] } {
  const islands = [...layout.hubs, ...layout.zones];
  const bridges: IslandBridge[] = layout.links.map((l) => ({ a: l.from, b: l.to }));
  layout.zones.forEach((z, i) => {
    const hub = layout.hubs.indexOf(z.anchor);
    if (hub >= 0) bridges.push({ a: hub, b: layout.hubs.length + i });
  });
  return { islands, bridges };
}

/**
 * One mini island at a time: the island the player stands on is live (built and drawn), the island across a bridge
 * starts building when the player nears that bridge and is drawn while the player is on it; the one behind is freed once
 * the player has left its bridge. Pure: feeds `DistrictStreamer` through `metric` and the far view through `live`.
 */
export class IslandStreamer {
  /** Index of the island the player stands on (or last stood on while on a bridge or in the water). */
  current = 0;
  private readonly links: number[][];
  private readonly bridgeDistance: Float64Array;
  private readonly liveSet: Uint8Array;
  private readonly wanted: Float64Array;

  constructor(
    readonly islands: readonly Circle[],
    readonly bridges: readonly IslandBridge[],
    private readonly policy: IslandPolicy,
  ) {
    this.links = islands.map(() => []);
    bridges.forEach((b, i) => {
      this.links[b.a]!.push(i);
      this.links[b.b]!.push(i);
    });
    this.bridgeDistance = new Float64Array(bridges.length).fill(Infinity);
    this.liveSet = new Uint8Array(islands.length);
    this.wanted = new Float64Array(islands.length).fill(Infinity);
    this.liveSet[0] = 1;
    this.wanted[0] = 0;
  }

  /** Re-reads where the player is; returns true when the current island changed. */
  update(x: number, z: number): boolean {
    const before = this.current;
    const on = this.islandAt(x, z);
    if (on >= 0) this.current = on;
    this.liveSet.fill(0);
    this.wanted.fill(Infinity);
    this.liveSet[this.current] = 1;
    this.wanted[this.current] = 0;
    for (const bi of this.links[this.current]!) {
      const b = this.bridges[bi]!;
      const d = deckDistance(this.islands[b.a]!, this.islands[b.b]!, x, z);
      this.bridgeDistance[bi] = d;
      const across = b.a === this.current ? b.b : b.a;
      if (this.policy.neighbours || d <= this.policy.preload) this.wanted[across] = Math.min(this.wanted[across]!, this.policy.neighbours ? 0 : d);
      if (this.policy.neighbours || d <= this.policy.show) this.liveSet[across] = 1;
    }
    return this.current !== before;
  }

  /** Whether island i is drawn at full detail. */
  live(i: number): boolean {
    return this.liveSet[i] === 1;
  }

  /** The bridge the player is on or nearest to, with progress 0 (current rim) to 1 (far rim), or null when on an island. */
  crossing(x: number, z: number): { across: number; t: number } | null {
    let best = -1;
    for (const bi of this.links[this.current]!) if (best < 0 || this.bridgeDistance[bi]! < this.bridgeDistance[best]!) best = bi;
    if (best < 0 || this.bridgeDistance[best]! > this.policy.show) return null;
    const b = this.bridges[best]!;
    const from = this.islands[this.current]!;
    const across = b.a === this.current ? b.b : b.a;
    const to = this.islands[across]!;
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const ux = (to.x - from.x) / len;
    const uz = (to.z - from.z) / len;
    const along = (x - from.x) * ux + (z - from.z) * uz;
    const t = (along - from.radius) / Math.max(1, len - from.radius - to.radius);
    if (t <= 0) return null;
    return { across, t: Math.min(1, t) };
  }

  /** Stream metric: 0 for live islands, the bridge distance for the one being preloaded, Infinity for the rest. */
  readonly metric: StreamMetric = (_unit, i) => this.wanted[i] ?? Infinity;

  /** The island whose circle (plus shore) holds (x, z), nearest centre first; -1 when none. */
  islandAt(x: number, z: number): number {
    let found = -1;
    let best = Infinity;
    for (let i = 0; i < this.islands.length; i++) {
      const c = this.islands[i]!;
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= c.radius + this.policy.shore && d - c.radius < best) {
        best = d - c.radius;
        found = i;
      }
    }
    return found;
  }
}

/** Distance from (x, z) to the deck of the bridge between two islands (rim to rim on the centre line). */
function deckDistance(a: Circle, b: Circle, x: number, z: number): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const ux = dx / len;
  const uz = dz / len;
  const ax = a.x + ux * a.radius;
  const az = a.z + uz * a.radius;
  const span = Math.max(0, len - a.radius - b.radius);
  const t = Math.max(0, Math.min(span, (x - ax) * ux + (z - az) * uz));
  const px = ax + ux * t - x;
  const pz = az + uz * t - z;
  return Math.sqrt(px * px + pz * pz);
}
