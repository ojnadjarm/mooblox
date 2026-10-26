import type { Sail } from './dressing';

/** Sailing speed along the circle (m/s). */
export const SAIL_SPEED = 5;

/** Where a sailing ship is and the yaw that points its bow (the model's +z) along its travel. */
export interface SailPose {
  x: number;
  z: number;
  yaw: number;
}

/** Ship `i` on its circle at time `t` (s): odd ships sail clockwise; written into `out` (no allocation per frame). */
export function sailPose(s: Sail, i: number, t: number, out: SailPose): SailPose {
  const dir = i % 2 ? -1 : 1;
  const a = dir * t * (SAIL_SPEED / s.r) + i * 2.1;
  out.x = s.x + Math.cos(a) * s.r;
  out.z = s.z + Math.sin(a) * s.r;
  // Travel = d/dt (cos a, sin a) = dir (-sin a, cos a); a yaw of θ turns +z to (sin θ, cos θ).
  out.yaw = Math.atan2(-dir * Math.sin(a), dir * Math.cos(a));
  return out;
}
