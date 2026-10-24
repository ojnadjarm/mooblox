import type { Object3D } from 'three';
import { M } from './motion';

/** Where the local player's head is, in the space its model sits in, for other characters to turn and look at. */
export const focus = {
  /** The player's model (it never looks at itself) and its parent; null = nobody to look at. */
  owner: null as object | null,
  space: null as Object3D | null,
  x: 0,
  y: 0,
  z: 0,
};

/** Writes the player's yaw, pitch and distance from `root`'s facing into motion state `m` (NaN distance: none in its space). */
export function sense(m: Float64Array, root: Object3D, self: object): void {
  if (focus.owner === self || focus.space === null || root.parent !== focus.space) {
    m[M.focusDist] = NaN;
    return;
  }
  const dx = focus.x - root.position.x;
  const dz = focus.z - root.position.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const a = Math.atan2(dx, dz) - root.rotation.y;
  m[M.focusDist] = d;
  m[M.focusYaw] = Math.atan2(Math.sin(a), Math.cos(a));
  m[M.focusPitch] = -Math.atan2(focus.y - root.position.y, d + 0.5);
}
