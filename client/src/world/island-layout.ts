import type { Section, WorldData } from '../domain/types';
import type { Circle, HubLink, LayoutPolicy, Plot, WorldLayout, Zone } from './layout';
import { seededRandom } from './random';

const HUB_RADIUS = 22;
const PLAZA_RADIUS = 13;
const ZONE_MARGIN = 10;
const PLOT_RADIUS = 2.5;
/** Centre-to-centre distance between neighbouring plots. */
const PLOT_PITCH = 6.5;
/** Radius of the first plot ring and the step between rings. */
const RING_STEP = 7;
/** Half width kept free through the rings along the entry walk. */
const ENTRY_CLEAR = 4;
const MIN_ZONE_RADIUS = 12;
const MIN_BRIDGE = 6;
/** Water between two islands (both beaches plus the fence shore). */
const ISLAND_GAP = 9;
/** Distance a bridge keeps from any other island's edge. */
const BRIDGE_CLEAR = 6;
/** Distance between two bridges that do not share a hub. */
const BRIDGE_APART = 6;
/** Width each bridge takes up on its hub's rim. */
const BRIDGE_SLOT = 7;
/** How much longer than the shortest a zone bridge may be before a new plaza is opened. */
const ZONE_REACH = 24;
const EXIT_LENGTH = 400;
const EXIT_TURNS = [1.1, 0.8, 0.5, 0.2, 0];
const BEARINGS = 120;
const DIST_STEP = 1;

/** Sizes of the hub and the building band around each zone's plot rings. */
export interface IslandSize {
  readonly hubRadius: number;
  readonly zoneMargin: number;
}

/** A bridge from a hub's rim (`hub` index) to another island's rim. */
export interface Span {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly hub: number;
  /** Hub index the span ends on, for links between plazas. */
  readonly end?: number;
}

/**
 * Procedural layout for any course shape. Plots sit on concentric rings inside each zone with a clear walk from the
 * bridge to the middle; zones are packed around the hub in course order, each with a straight bridge to it that clears
 * every other island. When the hub has no room left, a new plaza island opens further out (bridged to an earlier plaza,
 * never gated) and the next zones gather round it: the large-course fallback is an archipelago of plazas.
 */
export class IslandLayout implements LayoutPolicy {
  constructor(private readonly size: IslandSize = { hubRadius: HUB_RADIUS, zoneMargin: ZONE_MARGIN }) {}

  layout(world: WorldData): WorldLayout {
    const random = seededRandom(world.courseId);
    const packer = new Packer({ x: 0, z: 0, radius: this.size.hubRadius }, random() * 2 * Math.PI);
    const zones = world.sections.map((section): Zone => {
      const rings = plotRings(section.activities.length);
      const radius = Math.max(MIN_ZONE_RADIUS, (rings.at(-1)?.radius ?? 0) + PLOT_RADIUS + this.size.zoneMargin);
      const { x, z, angle, hub } = packer.zone(radius);
      const anchor = packer.hubs[hub]!;
      return { sectionId: section.id, angle, x, z, radius, anchor, plots: placePlots(section, { x, z, angle }, rings) };
    });
    const hubs = packer.hubs;
    return {
      hub: hubs[0]!,
      hubs,
      links: packer.links,
      spawn: { x: 0, z: 0 },
      zones,
      extent: Math.max(...[...hubs, ...zones].map((c) => Math.hypot(c.x, c.z) + c.radius)),
    };
  }
}

/** Greedy packer: islands as discs, bridges as rim-to-rim spans; every new island and bridge clears all of them. */
class Packer {
  readonly hubs: Circle[] = [];
  readonly links: HubLink[] = [];
  private readonly discs: Circle[] = [];
  private readonly spans: Span[] = [];
  private readonly bearings: number[][] = [];
  private last: number;

  private readonly exits: (Span | null)[] = [];

  constructor(
    hub: Circle,
    private readonly start: number,
  ) {
    this.addHub(hub, start + Math.PI, []);
    this.last = start;
  }

  zone(radius: number): { x: number; z: number; angle: number; hub: number } {
    for (let h = 0; h < this.hubs.length; h++) {
      const spot = this.find(h, radius, ZONE_REACH);
      if (spot) return this.commit(h, radius, spot);
    }
    const h = this.hubs.length - 1;
    const plaza = this.alongExit(h);
    const index = this.hubs.length;
    this.exits[h] = null;
    this.commit(h, PLAZA_RADIUS, plaza, index);
    const hub = { x: plaza.x, z: plaza.z, radius: PLAZA_RADIUS };
    this.addHub(hub, this.exitFor(hub, plaza.angle), [plaza.angle + Math.PI]);
    this.links.push({ from: h, to: index });
    const spot = this.find(index, radius, EXIT_LENGTH);
    if (!spot) throw new Error('mooblox: no room for a zone');
    return this.commit(index, radius, spot);
  }

  /** Each hub keeps one bearing free all the way out (its exit), where the next plaza opens when it fills up. */
  private addHub(hub: Circle, exit: number, taken: number[]): void {
    this.hubs.push(hub);
    this.discs.push(hub);
    this.bearings.push([...taken, exit]);
    const dx = Math.cos(exit);
    const dz = Math.sin(exit);
    this.exits.push({ ax: hub.x + dx * hub.radius, az: hub.z + dz * hub.radius, bx: hub.x + dx * EXIT_LENGTH, bz: hub.z + dz * EXIT_LENGTH, hub: this.hubs.length - 1 });
  }

  /** A new plaza's exit: turned off its link so the plazas curl round the hub, on the first bearing that is clear. */
  private exitFor(hub: Circle, link: number): number {
    for (const turn of EXIT_TURNS) {
      const a = link + turn;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const exit = { ax: hub.x + dx * hub.radius, az: hub.z + dz * hub.radius, bx: hub.x + dx * EXIT_LENGTH, bz: hub.z + dz * EXIT_LENGTH, hub: -1 };
      if (!this.crossesIsland(exit, hub) && this.spans.every((s) => s.end !== undefined || spansDistance(s, exit) >= BRIDGE_APART)) return a;
    }
    return link;
  }

  /** The nearest plaza spot on hub h's exit. */
  private alongExit(h: number): { x: number; z: number; angle: number } {
    const hub = this.hubs[h]!;
    const exit = this.exits[h]!;
    const angle = Math.atan2(exit.bz - exit.az, exit.bx - exit.ax);
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    for (let d = hub.radius + MIN_BRIDGE + PLAZA_RADIUS; d < EXIT_LENGTH; d += DIST_STEP) {
      const x = hub.x + dx * d;
      const z = hub.z + dz * d;
      const bridge = { ax: exit.ax, az: exit.az, bx: x - dx * PLAZA_RADIUS, bz: z - dz * PLAZA_RADIUS, hub: h };
      if (this.crossesIsland(bridge, hub)) break;
      if (this.fits(x, z, PLAZA_RADIUS, hub, h, bridge, exit)) return { x, z, angle };
    }
    throw new Error('mooblox: no room for a plaza');
  }

  /** Nearest spot round hub h within `reach` of the shortest bridge; ties go to the next bearing on from the last one. */
  private find(h: number, radius: number, reach: number): { x: number; z: number; angle: number } | null {
    const hub = this.hubs[h]!;
    let best: { x: number; z: number; angle: number; d: number; turn: number } | null = null;
    const first = hub.radius + MIN_BRIDGE + radius;
    for (let k = 0; k < BEARINGS; k++) {
      const angle = this.start + (k / BEARINGS) * 2 * Math.PI;
      if (this.bearings[h]!.some((b) => Math.abs(wrap(angle - b)) * hub.radius < BRIDGE_SLOT)) continue;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const limit = Math.min(best ? best.d : Infinity, first + reach);
      for (let d = first; d <= limit; d += DIST_STEP) {
        const x = hub.x + dx * d;
        const z = hub.z + dz * d;
        const bridge = { ax: hub.x + dx * hub.radius, az: hub.z + dz * hub.radius, bx: x - dx * radius, bz: z - dz * radius, hub: h };
        if (this.crossesIsland(bridge, hub)) break;
        if (this.fits(x, z, radius, hub, h, bridge)) {
          const turn = (((angle - this.last) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
          if (!best || d < best.d || (d === best.d && turn < best.turn)) best = { x, z, angle, d, turn };
          break;
        }
      }
    }
    return best;
  }

  /** Whether an island sits across the bridge (no longer bridge on this bearing can pass it either). */
  private crossesIsland(s: Span, hub: Circle): boolean {
    return this.discs.some((c) => c !== hub && segmentDistance(c.x, c.z, s) < c.radius + BRIDGE_CLEAR);
  }

  private fits(x: number, z: number, radius: number, hub: Circle, h: number, bridge: Span, own: Span | null = null): boolean {
    const spans = [...this.spans, ...this.exits.filter((e): e is Span => e !== null && e !== own)];
    return (
      this.discs.every((c) => c === hub || Math.hypot(x - c.x, z - c.z) >= radius + c.radius + ISLAND_GAP) &&
      spans.every((s) => segmentDistance(x, z, s) >= radius + BRIDGE_CLEAR) &&
      spans.every((s) => s.hub === h || s.end === h || spansDistance(s, bridge) >= BRIDGE_APART)
    );
  }

  private commit(h: number, radius: number, spot: { x: number; z: number; angle: number }, end?: number): { x: number; z: number; angle: number; hub: number } {
    const hub = this.hubs[h]!;
    const dx = Math.cos(spot.angle);
    const dz = Math.sin(spot.angle);
    if (end === undefined) this.discs.push({ x: spot.x, z: spot.z, radius });
    this.spans.push({ ax: hub.x + dx * hub.radius, az: hub.z + dz * hub.radius, bx: spot.x - dx * radius, bz: spot.z - dz * radius, hub: h, ...(end === undefined ? {} : { end }) });
    this.bearings[h]!.push(spot.angle);
    this.last = spot.angle;
    return { ...spot, hub: h };
  }
}

interface Ring {
  readonly radius: number;
  readonly count: number;
}

/** Ring sizes for `count` plots: one plot in the middle, else rings of RING_STEP filled from the inside. */
export function plotRings(count: number): Ring[] {
  if (count === 0) return [];
  if (count === 1) return [{ radius: 0, count: 1 }];
  const rings: Ring[] = [];
  let left = count;
  for (let r = RING_STEP; left > 0; r += RING_STEP) {
    const take = Math.min(left, ringCapacity(r));
    rings.push({ radius: r, count: take });
    left -= take;
  }
  return rings;
}

function ringCapacity(r: number): number {
  return Math.max(1, Math.floor(ringSpan(r) / (2 * Math.asin(Math.min(1, PLOT_PITCH / 2 / r)))));
}

/** Arc of a ring left for plots once the entry walk is cut out. */
function ringSpan(r: number): number {
  return 2 * Math.PI - 2 * Math.asin(Math.min(1, ENTRY_CLEAR / r));
}

/** Distance from (px, pz) to a segment. */
export function segmentDistance(px: number, pz: number, s: { readonly ax: number; readonly az: number; readonly bx: number; readonly bz: number }): number {
  const vx = s.bx - s.ax;
  const vz = s.bz - s.az;
  const l2 = vx * vx + vz * vz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * vx + (pz - s.az) * vz) / l2));
  return Math.hypot(px - s.ax - t * vx, pz - s.az - t * vz);
}

function spansDistance(a: Span, b: Span): number {
  const cross = (o: Span, px: number, pz: number) => (o.bx - o.ax) * (pz - o.az) - (o.bz - o.az) * (px - o.ax);
  const straddles = (o: Span, p: Span) => cross(o, p.ax, p.az) * cross(o, p.bx, p.bz) < 0;
  if (straddles(a, b) && straddles(b, a)) return 0;
  return Math.min(segmentDistance(a.ax, a.az, b), segmentDistance(a.bx, a.bz, b), segmentDistance(b.ax, b.az, a), segmentDistance(b.bx, b.bz, a));
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Plots ring by ring, spread over each ring's arc, leaving the walk from the bridge to the middle free. */
function placePlots(section: Section, c: { x: number; z: number; angle: number }, rings: readonly Ring[]): Plot[] {
  const entry = c.angle + Math.PI;
  const plots: Plot[] = [];
  let next = 0;
  for (const ring of rings) {
    const span = ring.radius === 0 ? 0 : ringSpan(ring.radius);
    for (let i = 0; i < ring.count; i++) {
      const a = entry + (2 * Math.PI - span) / 2 + (span * (i + 0.5)) / ring.count;
      const x = c.x + Math.cos(a) * ring.radius;
      const z = c.z + Math.sin(a) * ring.radius;
      const activity = section.activities[next++]!;
      const facing = ring.radius === 0 ? Math.atan2(-Math.cos(c.angle), -Math.sin(c.angle)) : Math.atan2(c.x - x, c.z - z);
      plots.push({ activityId: activity.id, sectionId: section.id, x, z, radius: PLOT_RADIUS, facing });
    }
  }
  return plots;
}
