import { Vector3 } from 'three';
import type { Collider } from './collider';

/** World-space move intent: x/z with length ≤ 1, plus the run and jump buttons. */
export interface MoveInput {
  readonly x: number;
  readonly z: number;
  readonly run: boolean;
  readonly jump: boolean;
}

/** The character's feet position, velocity and ground contact. */
export interface Body {
  readonly position: Vector3;
  readonly velocity: Vector3;
  onGround: boolean;
}

export const Physics = {
  step: 1 / 60,
  gravity: -30,
  walk: 6,
  run: 10,
  jump: 10,
  radius: 0.5,
  height: 2.6,
} as const;

const start = new Vector3();
const end = new Vector3();

/** One fixed physics step of the capsule character: gravity, move, jump, push out of the world. */
export function stepBody(body: Body, input: MoveInput, dt: number, collider: Collider): void {
  const len = Math.hypot(input.x, input.z);
  const speed = (input.run ? Physics.run : Physics.walk) * Math.min(1, len);
  const k = len === 0 ? 0 : speed / len;
  const v = body.velocity;
  if (body.onGround) {
    v.y = input.jump ? Physics.jump : Physics.gravity * dt;
  } else {
    v.y += Physics.gravity * dt;
  }
  const p = body.position;
  p.x += input.x * k * dt;
  p.z += input.z * k * dt;
  p.y += v.y * dt;

  start.set(p.x, p.y + Physics.radius, p.z);
  end.set(p.x, p.y + Physics.height - Physics.radius, p.z);
  const push = collider.resolve(start, end, Physics.radius);
  const depth = push.length();
  body.onGround = v.y <= 0 && push.y > Math.abs(dt * v.y * 0.25);
  if (depth > 1e-5) {
    p.addScaledVector(push, (depth - 1e-5) / depth);
  }
  if (body.onGround) {
    v.y = 0;
  } else if (depth > 0) {
    push.divideScalar(depth);
    v.addScaledVector(push, -push.dot(v));
  }
}
