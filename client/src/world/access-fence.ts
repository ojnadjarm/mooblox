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

  constructor(private layout: WorldLayout) {}

  /** Swaps the layout after a rebuild. */
  setLayout(layout: WorldLayout): void {
    this.layout = layout;
  }

  setClosed(ids: ReadonlySet<number>): void {
    this.closed = new Set(ids);
  }

  isClosed(sectionId: number): boolean {
    return this.closed.has(sectionId);
  }

  /** Offset (dx, dz) that moves a body at (x, z) out of every closed region; zero when it is outside. */
  push(x: number, z: number, r: number): { x: number; z: number } {
    let px = x;
    let pz = z;
    for (const zone of this.layout.zones) {
      if (!this.closed.has(zone.sectionId)) {
        continue;
      }
      const g = gateSpot(zone);
      const t = (px - g.ax) * g.dx + (pz - g.az) * g.dz;
      const side = -(px - g.ax) * g.dz + (pz - g.az) * g.dx;
      if (t > g.t - r && Math.abs(side) < CORRIDOR + r && t < g.t + GATE_SETBACK + 1) {
        px += (g.t - r - t) * g.dx;
        pz += (g.t - r - t) * g.dz;
        continue;
      }
      const ox = px - zone.x;
      const oz = pz - zone.z;
      const d = Math.hypot(ox, oz);
      const keep = zone.radius + ZONE_SHORE + r;
      if (d < keep) {
        const k = d < 1e-6 ? keep : keep / d;
        px = zone.x + (d < 1e-6 ? -g.dx : ox) * k;
        pz = zone.z + (d < 1e-6 ? -g.dz : oz) * k;
      }
    }
    return { x: px - x, z: pz - z };
  }
}
