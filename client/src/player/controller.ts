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
  const len = Math.sqrt(input.x * input.x + input.z * input.z);
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

  start.x = end.x = p.x;
  start.z = end.z = p.z;
  start.y = p.y + Physics.radius;
  end.y = p.y + Physics.height - Physics.radius;
  const push = collider.resolve(start, end, Physics.radius);
  // Inline maths: doubles passed to or returned from a non-inlined call are boxed (one heap number each).
  const depth = Math.sqrt(push.x * push.x + push.y * push.y + push.z * push.z);
  body.onGround = v.y <= 0 && push.y > Math.abs(dt * v.y * 0.25);
  if (depth > 1e-5) {
    const f = (depth - 1e-5) / depth;
    p.x += push.x * f;
    p.y += push.y * f;
    p.z += push.z * f;
  }
  if (body.onGround) {
    v.y = 0;
  } else if (depth > 0) {
    const nx = push.x / depth;
    const ny = push.y / depth;
    const nz = push.z / depth;
    const into = nx * v.x + ny * v.y + nz * v.z;
    v.x -= nx * into;
    v.y -= ny * into;
    v.z -= nz * into;
  }
}
