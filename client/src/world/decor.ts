import type { WorldLayout } from './layout';
import { seededRandom } from './random';

export type DecorKind = 'tree' | 'pine' | 'rock' | 'bush';

/** One decoration on the ground; never on a plot, a bridge or the plaza. */
export interface DecorSpot {
  readonly kind: DecorKind;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly yaw: number;
}

const KINDS: readonly DecorKind[] = ['tree', 'tree', 'pine', 'bush', 'rock'];
const PLOT_CLEAR = 1.5;
const BRIDGE_CLEAR = 2.6;
const SPOT_GAP = 1.6;
const PLAZA = 7;
const RIM = 1.2;

/** Scatters decorations over the hub rim and each zone, seeded by course id. */
export function scatterDecor(layout: WorldLayout, seed: number): DecorSpot[] {
  const random = seededRandom(seed ^ 0x9e3779b9);
  const spots: DecorSpot[] = [];
  const plots = layout.zones.flatMap((z) => z.plots);
  const clear = (x: number, z: number): boolean =>
    plots.every((p) => Math.hypot(x - p.x, z - p.z) > p.radius + PLOT_CLEAR) &&
    layout.zones.every((zone) => distanceToBridge(x, z, zone.x, zone.z) > BRIDGE_CLEAR) &&
    spots.every((s) => Math.hypot(x - s.x, z - s.z) > SPOT_GAP);

  const fill = (cx: number, cz: number, inner: number, outer: number, tries: number): void => {
    for (let i = 0; i < tries; i++) {
      const a = random() * 2 * Math.PI;
      const r = Math.sqrt(inner * inner + random() * (outer * outer - inner * inner));
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const kind = KINDS[Math.floor(random() * KINDS.length)]!;
      const scale = 0.8 + random() * 0.5;
      const yaw = random() * 2 * Math.PI;
      if (clear(x, z)) {
        spots.push({ kind, x, z, scale, yaw });
      }
    }
  };

  fill(layout.hub.x, layout.hub.z, PLAZA, layout.hub.radius - RIM, 24);
  for (const zone of layout.zones) {
    fill(zone.x, zone.z, 0, zone.radius - RIM, Math.round(zone.radius * 2.5));
  }
  return spots;
}

/** Distance from (x, z) to the hub-to-zone bridge segment. */
function distanceToBridge(x: number, z: number, zx: number, zz: number): number {
  const len2 = zx * zx + zz * zz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (x * zx + z * zz) / len2));
  return Math.hypot(x - t * zx, z - t * zz);
}
