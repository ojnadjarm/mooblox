import type { WorldData } from '../domain/types';
import type { Circle, WorldLayout } from './layout';

/** What the island layout depends on: the sections and their activities, in order. */
export function structureKey(world: WorldData): string {
  return world.sections.map((s) => `${s.id}:${s.activities.map((a) => a.id).join(',')}`).join('|');
}

/** Offset that keeps a body at (x, z) on the same ground after a relayout: it moves with its zone (or the hub). */
export function shiftFor(before: WorldLayout, after: WorldLayout, x: number, z: number): { x: number; z: number } {
  const inside = (c: Circle) => Math.hypot(x - c.x, z - c.z) <= c.radius + 3;
  const zone = before.zones.find(inside);
  const next = zone && after.zones.find((n) => n.sectionId === zone.sectionId);
  if (!zone || !next) {
    return { x: 0, z: 0 };
  }
  return { x: next.x - zone.x, z: next.z - zone.z };
}
