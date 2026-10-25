import type { Object3D } from 'three';
import { M, MOTION } from './motion';

/** Where the local player's head is, in the space its model sits in, for other characters to turn and look at, and its last emote. */
export const focus = {
  /** The player's model (it never looks at itself) and its parent; null = nobody to look at. */
  owner: null as object | null,
  space: null as Object3D | null,
  x: 0,
  y: 0,
  z: 0,
  /** The idle act the player last triggered (-1 none), seconds since, and a serial per emote. */
  cue: -1,
  cueAge: 0,
  cueId: 0,
};

/** Writes the yaw, pitch and distance of what `root` looks at into motion state `m`: the player when near, else its gaze spot (NaN distance: none). */
export function sense(m: Float64Array, root: Object3D, self: object): void {
  const gx = m[M.gazeX]!;
  const player = focus.owner !== self && focus.space !== null && root.parent === focus.space;
  const px = focus.x - root.position.x;
  const pz = focus.z - root.position.z;
  const pd = player ? Math.sqrt(px * px + pz * pz) : NaN;
  if (gx === gx && !(pd < MOTION.lookNear)) {
    const dx = gx - root.position.x;
    const dz = m[M.gazeZ]! - root.position.z;
    write(m, dx, dz, Math.sqrt(dx * dx + dz * dz), m[M.gazeUp]!, root.rotation.y);
    return;
  }
  if (!player) {
    m[M.focusDist] = NaN;
    return;
  }
  write(m, px, pz, pd, focus.y - root.position.y, root.rotation.y);
}

function write(m: Float64Array, dx: number, dz: number, d: number, up: number, facing: number): void {
  const a = Math.atan2(dx, dz) - facing;
  m[M.focusDist] = d;
  m[M.focusYaw] = Math.atan2(Math.sin(a), Math.cos(a));
  m[M.focusPitch] = -Math.atan2(up, d + 0.5);
}
