/** Where the pet heads: beside and behind the leader (seen by the follow camera), no collision. */
export const PET = {
  behind: 1.1,
  side: 0.8,
  /** Pull towards the follow point per metre of error (1/s). */
  gain: 6,
  maxSpeed: 16,
  /** Farther than this (a teleport, a rebuild) the pet jumps to its spot. */
  snap: 12,
  turn: 10,
} as const;

/** The leader the pet follows: feet position and facing (yaw 0 = +z). */
export interface Leader {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface PetState {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly speed: number;
  /** The leader's position at the last step (its velocity is fed forward). */
  readonly lx: number;
  readonly lz: number;
}

/** The pet's spot next to `l`. */
export function followPoint(l: Leader, p: typeof PET = PET): { x: number; z: number } {
  const fx = Math.sin(l.yaw);
  const fz = Math.cos(l.yaw);
  return { x: l.x - fx * p.behind - fz * p.side, z: l.z - fz * p.behind + fx * p.side };
}

/** A pet standing at its spot. */
export function startPet(l: Leader, p: typeof PET = PET): PetState {
  const f = followPoint(l, p);
  return { x: f.x, z: f.z, yaw: l.yaw, speed: 0, lx: l.x, lz: l.z };
}

/** One step: the leader's velocity plus a pull towards the spot (no lag while running), capped, turning smoothly. */
export function stepPet(s: PetState, l: Leader, dt: number, p: typeof PET = PET): PetState {
  if (dt <= 0) {
    return s;
  }
  const f = followPoint(l, p);
  const ex = f.x - s.x;
  const ez = f.z - s.z;
  if (Math.hypot(ex, ez) > p.snap) {
    return startPet(l, p);
  }
  let vx = (l.x - s.lx) / dt + ex * p.gain;
  let vz = (l.z - s.lz) / dt + ez * p.gain;
  let speed = Math.hypot(vx, vz);
  if (speed > p.maxSpeed) {
    vx *= p.maxSpeed / speed;
    vz *= p.maxSpeed / speed;
    speed = p.maxSpeed;
  }
  const target = speed > 0.6 ? Math.atan2(vx, vz) : l.yaw;
  const delta = Math.atan2(Math.sin(target - s.yaw), Math.cos(target - s.yaw));
  return { x: s.x + vx * dt, z: s.z + vz * dt, yaw: s.yaw + delta * Math.min(1, p.turn * dt), speed, lx: l.x, lz: l.z };
}
