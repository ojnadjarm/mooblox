import type { Dressing } from '../world/dressing';
import type { Circle, WorldLayout } from '../world/layout';
import { CAMPUS } from '../world/look';

/** A fixed camera: eye and look-at point (m). */
export interface Shot {
  readonly eye: { readonly x: number; readonly y: number; readonly z: number };
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
  /** Lens shift: the frame slides down by this share of its height (verticals stay upright, the horizon rises). */
  readonly shift?: number;
}

/** The concept cameras of the art bible (`hub.jpg`, `district.jpg`, `shore.jpg`) rebuilt on any course, plus a sunlit hub cliff. */
export type ShotName = 'hub' | 'district' | 'shore' | 'cliff';

/** District themes in the order the shots prefer them (the concepts show a library and a lighthouse). */
const DISTRICT_PICK = ['library', 'science', 'arts', 'sports', 'harbour'];
const SHORE_PICK = ['harbour', 'arts', 'science', 'library', 'sports'];

/**
 * Pure camera poses for the concept views: the hub from above its far side with the tower at the back, a district from
 * outside its rim with the landmark at the back, and a low shore view over the water with the landmark and the horizon.
 */
export function conceptShot(name: ShotName, layout: WorldLayout, dressing: Dressing): Shot {
  const hub = layout.hub;
  if (name === 'cliff') {
    // From open water on the sun side of the hub, low, along the curve of its rim (the bearing nearest the sun with no island
    // or bridge within 6 m of the camera).
    const sun = Math.atan2(CAMPUS.sun.dir[2], CAMPUS.sun.dir[0]);
    const d = hub.radius + 12;
    const clear = (b: number) => {
      const x = hub.x + Math.cos(b) * d;
      const z = hub.z + Math.sin(b) * d;
      return layout.zones.every((zn) => Math.hypot(x - zn.x, z - zn.z) > zn.radius + 6 && segment(x, z, zn.anchor, zn) > 6);
    };
    const a = Array.from({ length: 64 }, (_, i) => sun + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.1).find(clear) ?? sun;
    return {
      eye: { x: hub.x + Math.cos(a) * d, y: 4, z: hub.z + Math.sin(a) * d },
      at: { x: hub.x + Math.cos(a - 0.3) * hub.radius, y: -1, z: hub.z + Math.sin(a - 0.3) * hub.radius },
    };
  }
  if (name === 'hub') {
    const tower = dressing.focus ?? { x: hub.x, z: hub.z - 1 };
    const [ux, uz] = unit(hub.x - tower.x, hub.z - tower.z);
    const r = hub.radius;
    // Nearly level with a shifted lens, as the concept: upright tower, sky over the top third, the plaza below.
    const eye = { x: hub.x + ux * r * 1.3, y: r * 0.6, z: hub.z + uz * r * 1.3 };
    const at = { x: hub.x - ux * r * 0.3, z: hub.z - uz * r * 0.3 };
    return { eye, at: { ...at, y: eye.y - Math.tan(0.05) * Math.hypot(at.x - eye.x, at.z - eye.z) }, shift: 0.17 };
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

/** Distance from (x, z) to the segment between two circle centres. */
function segment(x: number, z: number, a: Circle, b: Circle): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

function unit(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}
