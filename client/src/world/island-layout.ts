import type { Section, WorldData } from '../domain/types';
import type { LayoutPolicy, Plot, WorldLayout, Zone } from './layout';
import { seededRandom } from './random';

const HUB_RADIUS = 12;
const PLOT_RADIUS = 2.5;
const PLOT_GAP = 1.5;
const ZONE_MARGIN = 2;
const MIN_ZONE_RADIUS = 6;
const BRIDGE = 6;
const ZONE_GAP = 4;
const JITTER = 0.2;

/** v1 layout: a hub at the origin and one round zone per section on a ring around it. */
export class IslandLayout implements LayoutPolicy {
  layout(world: WorldData): WorldLayout {
    const random = seededRandom(world.courseId);
    const n = world.sections.length;
    const rings = world.sections.map((s) => plotRing(s.activities.length));
    const maxZone = Math.max(MIN_ZONE_RADIUS, ...rings.map((r) => r.zoneRadius));
    const step = (2 * Math.PI) / Math.max(n, 1);
    const ring = ringRadius(n, maxZone, step);
    const start = random() * 2 * Math.PI;

    const zones = world.sections.map((section, i): Zone => {
      const angle = start + i * step + (random() * 2 - 1) * JITTER * (step / 2);
      const x = Math.cos(angle) * ring;
      const z = Math.sin(angle) * ring;
      const { zoneRadius, plotRadius } = rings[i]!;
      return {
        sectionId: section.id,
        angle,
        x,
        z,
        radius: zoneRadius,
        plots: placePlots(section, x, z, plotRadius, random() * 2 * Math.PI),
      };
    });

    return {
      hub: { x: 0, z: 0, radius: HUB_RADIUS },
      spawn: { x: 0, z: 0 },
      zones,
      extent: n === 0 ? HUB_RADIUS : ring + maxZone,
    };
  }
}

/** Radius of the plot ring inside a zone and the zone radius that holds it. */
function plotRing(count: number): { plotRadius: number; zoneRadius: number } {
  const plotRadius = count < 2 ? 0 : (PLOT_RADIUS + PLOT_GAP / 2) / Math.sin(Math.PI / count);
  return { plotRadius, zoneRadius: Math.max(MIN_ZONE_RADIUS, plotRadius + PLOT_RADIUS + ZONE_MARGIN) };
}

/** Smallest ring that keeps jittered neighbours apart and clears the hub. */
function ringRadius(n: number, zoneRadius: number, step: number): number {
  const clearHub = HUB_RADIUS + BRIDGE + zoneRadius;
  if (n < 2) {
    return clearHub;
  }
  const minHalfAngle = (step / 2) * (1 - JITTER);
  return Math.max(clearHub, (zoneRadius + ZONE_GAP / 2) / Math.sin(minHalfAngle));
}

function placePlots(section: Section, cx: number, cz: number, ring: number, rotation: number): Plot[] {
  const count = section.activities.length;
  return section.activities.map((a, i) => {
    const angle = rotation + (i * 2 * Math.PI) / count;
    const x = cx + Math.cos(angle) * ring;
    const z = cz + Math.sin(angle) * ring;
    return {
      activityId: a.id,
      sectionId: section.id,
      x,
      z,
      radius: PLOT_RADIUS,
      facing: Math.atan2(cx - x, cz - z),
    };
  });
}
