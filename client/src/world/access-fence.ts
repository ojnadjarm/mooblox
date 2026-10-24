import type { WorldData } from '../domain/types';
import type { WorldLayout, Zone } from './layout';

/** Beach ring beyond a zone's grass that still belongs to it. */
export const ZONE_SHORE = 2.2;
/** Distance from the zone edge, back along its bridge, where the gate stands. */
export const GATE_SETBACK = 2.8;
/** Half width of the bridge corridor the fence closes between the gate and the zone. */
const CORRIDOR = 2.2;

/** Where a zone's gate stands on its bridge: `t` metres from its hub's centre (ax, az) along the bearing (dx, dz). */
export interface GateSpot {
  readonly sectionId: number;
  readonly ax: number;
  readonly az: number;
  readonly x: number;
  readonly z: number;
  readonly t: number;
  readonly dx: number;
  readonly dz: number;
  readonly yaw: number;
}

/** The gate spot of a zone, on its bridge just before the shore. */
export function gateSpot(zone: Zone): GateSpot {
  const { x: ax, z: az } = zone.anchor;
  const dist = Math.hypot(zone.x - ax, zone.z - az);
  const dx = (zone.x - ax) / dist;
  const dz = (zone.z - az) / dist;
  const t = dist - zone.radius - GATE_SETBACK;
  return { sectionId: zone.sectionId, ax, az, x: ax + dx * t, z: az + dz * t, t, dx, dz, yaw: Math.atan2(dx, dz) };
}

/** Ids of the sections the user cannot enter. */
export function closedSections(world: WorldData): Set<number> {
  return new Set(world.sections.filter((s) => !s.available).map((s) => s.id));
}

/** Keeps a body of radius r out of closed zones: their island, shore and the bridge past the gate, at any height. */
export class AccessFence {
  private closed = new Set<number>();
  private readonly out = { x: 0, z: 0 };
  private readonly at = { x: 0, z: 0 };
  private spots: GateSpot[];

  constructor(private layout: WorldLayout) {
    this.spots = layout.zones.map(gateSpot);
  }

  /** Swaps the layout after a rebuild. */
  setLayout(layout: WorldLayout): void {
    this.layout = layout;
    this.spots = layout.zones.map(gateSpot);
  }

  setClosed(ids: ReadonlySet<number>): void {
    this.closed = new Set(ids);
  }

  isClosed(sectionId: number): boolean {
    return this.closed.has(sectionId);
  }

  /** Offset (dx, dz) that moves a body at (x, z) out of every closed region; zero when it is outside. Valid until the next call. */
  push(x: number, z: number, r: number): { readonly x: number; readonly z: number } {
    this.at.x = x;
    this.at.z = z;
    return this.pushPoint(this.at, r);
  }

  /** `push` for a point object (the per-step path: no number arguments to box). */
  pushPoint(at: { readonly x: number; readonly z: number }, r: number): { readonly x: number; readonly z: number } {
    const x = at.x;
    const z = at.z;
    let px = x;
    let pz = z;
    const zones = this.layout.zones;
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i]!;
      if (!this.closed.has(zone.sectionId)) {
        continue;
      }
      const g = this.spots[i]!;
      const t = (px - g.ax) * g.dx + (pz - g.az) * g.dz;
      const side = -(px - g.ax) * g.dz + (pz - g.az) * g.dx;
      if (t > g.t - r && Math.abs(side) < CORRIDOR + r && t < g.t + GATE_SETBACK + 1) {
        px += (g.t - r - t) * g.dx;
        pz += (g.t - r - t) * g.dz;
        continue;
      }
      const ox = px - zone.x;
      const oz = pz - zone.z;
      const d = Math.sqrt(ox * ox + oz * oz);
      const keep = zone.radius + ZONE_SHORE + r;
      if (d < keep) {
        const k = d < 1e-6 ? keep : keep / d;
        px = zone.x + (d < 1e-6 ? -g.dx : ox) * k;
        pz = zone.z + (d < 1e-6 ? -g.dz : oz) * k;
      }
    }
    this.out.x = px - x;
    this.out.z = pz - z;
    return this.out;
  }
}
