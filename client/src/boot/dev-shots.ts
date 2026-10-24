import type { Dressing } from '../world/dressing';
import type { Circle, WorldLayout } from '../world/layout';

/** A fixed camera: eye and look-at point (m). */
export interface Shot {
  readonly eye: { readonly x: number; readonly y: number; readonly z: number };
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
}

/** The concept cameras of the art bible (`hub.jpg`, `district.jpg`, `shore.jpg`) rebuilt on any course. */
export type ShotName = 'hub' | 'district' | 'shore';

/** District themes in the order the shots prefer them (the concepts show a library and a lighthouse). */
const DISTRICT_PICK = ['library', 'science', 'arts', 'sports', 'harbour'];
const SHORE_PICK = ['harbour', 'arts', 'science', 'library', 'sports'];

/**
 * Pure camera poses for the concept views: the hub from above its far side with the tower at the back, a district from
 * outside its rim with the landmark at the back, and a low shore view over the water with the landmark and the horizon.
 */
export function conceptShot(name: ShotName, layout: WorldLayout, dressing: Dressing): Shot {
  const hub = layout.hub;
  if (name === 'hub') {
    const tower = dressing.focus ?? { x: hub.x, z: hub.z - 1 };
    const [ux, uz] = unit(hub.x - tower.x, hub.z - tower.z);
    const r = hub.radius;
    return {
      eye: { x: hub.x + ux * r * 0.95 - uz * r * 0.3, y: r * 0.62, z: hub.z + uz * r * 0.95 + ux * r * 0.3 },
      at: { x: hub.x - ux * r * 0.3, y: 3, z: hub.z - uz * r * 0.3 },
    };
  }
  const picks = name === 'district' ? DISTRICT_PICK : SHORE_PICK;
  const marks = dressing.landmarks.filter((m) => m.theme !== 'hub');
  const mark = picks.map((t) => marks.find((m) => m.theme === t)).find((m) => m) ?? marks[0];
  const zone: Circle = (mark && layout.zones.find((z) => Math.hypot(z.x - mark.x, z.z - mark.z) < z.radius)) || layout.zones[0] || hub;
  const lm = mark ?? { x: zone.x, z: zone.z, top: 6 };
  const [vx, vz] = unit(zone.x - lm.x, zone.z - lm.z);
  const R = zone.radius;
  if (name === 'district') {
    return {
      eye: { x: zone.x + vx * R * 1.15 + vz * R * 0.3, y: R * 0.6, z: zone.z + vz * R * 1.15 - vx * R * 0.3 },
      at: { x: zone.x - vx * R * 0.3, y: 3, z: zone.z - vz * R * 0.3 },
    };
  }
  // Shore: from the water beside the landmark, 60 degrees round from its side, low enough to keep the horizon in frame.
  const a = Math.atan2(lm.z - zone.z, lm.x - zone.x) + Math.PI / 3;
  const d = R + 8;
  return {
    eye: { x: zone.x + Math.cos(a) * d, y: 7, z: zone.z + Math.sin(a) * d },
    at: { x: (lm.x + zone.x) / 2, y: Math.min(5, lm.top * 0.3), z: (lm.z + zone.z) / 2 },
  };
}

function unit(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}
