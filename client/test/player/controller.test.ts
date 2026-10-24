import { BoxGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BvhCollider } from '../../src/player/collider';
import { Physics, stepBody, type Body, type MoveInput } from '../../src/player/controller';
import { FixedStep } from '../../src/player/fixed-step';

const idle: MoveInput = { x: 0, z: 0, run: false, jump: false };
const forward: MoveInput = { x: 0, z: 1, run: false, jump: false };
const dt = Physics.step;

function ground(): Mesh {
  return new Mesh(new PlaneGeometry(200, 200).rotateX(-Math.PI / 2));
}

function body(x = 0, y = 0, z = 0): Body {
  return { position: new Vector3(x, y, z), velocity: new Vector3(), onGround: false };
}

function run(b: Body, input: MoveInput, steps: number, collider: BvhCollider): void {
  for (let i = 0; i < steps; i++) {
    stepBody(b, input, dt, collider);
  }
}

describe('stepBody', () => {
  it('falls under gravity: v = g·t, y = ½·g·t² (semi-implicit)', () => {
    const empty = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(1, 1, 1).translate(500, 500, 500))]);
    const b = body(0, 100, 0);
    run(b, idle, 60, empty);
    expect(b.velocity.y).toBeCloseTo(Physics.gravity, 5);
    expect(b.position.y).toBeCloseTo(100 + 0.5 * Physics.gravity * (1 + dt), 1);
    expect(b.onGround).toBe(false);
  });

  it('lands on the ground and stays there', () => {
    const c = BvhCollider.fromMeshes([ground()]);
    const b = body(0, 3, 0);
    run(b, idle, 120, c);
    expect(b.onGround).toBe(true);
    expect(Math.abs(b.position.y)).toBeLessThan(0.02);
    run(b, idle, 60, c);
    expect(Math.abs(b.position.y)).toBeLessThan(0.02);
  });

  it('walks at walk speed and jumps back to the ground', () => {
    const c = BvhCollider.fromMeshes([ground()]);
    const b = body();
    run(b, idle, 10, c);
    run(b, forward, 60, c);
    expect(b.position.z).toBeCloseTo(Physics.walk, 1);
    stepBody(b, { ...idle, jump: true }, dt, c);
    expect(b.onGround).toBe(false);
    run(b, idle, 10, c);
    expect(b.position.y).toBeGreaterThan(1);
    run(b, idle, 120, c);
    expect(b.onGround).toBe(true);
  });

  it('climbs a 20° slope and is stopped by a wall', () => {
    const a = (20 * Math.PI) / 180;
    const slope = new Mesh(new PlaneGeometry(10, 40).rotateX(-Math.PI / 2 - a).translate(0, 20 * Math.sin(a), 20 * Math.cos(a)));
    const c = BvhCollider.fromMeshes([ground(), slope]);
    const b = body(0, 0, 0.5);
    run(b, idle, 10, c);
    run(b, forward, 120, c);
    expect(b.position.y).toBeGreaterThan(2);
    expect(Math.abs(b.position.y - Math.tan(a) * b.position.z)).toBeLessThan(0.3);

    const wall = new Mesh(new BoxGeometry(10, 5, 1).translate(0, 2.5, 5));
    const w = BvhCollider.fromMeshes([ground(), wall]);
    const b2 = body();
    run(b2, idle, 10, w);
    run(b2, forward, 120, w);
    expect(b2.position.z).toBeLessThan(5 - 0.5 - Physics.radius + 0.05);
  });
});

describe('FixedStep', () => {
  it('runs whole steps and carries the remainder', () => {
    const f = new FixedStep(0.01);
    let n = 0;
    expect(f.advance(0.025, () => n++)).toBeCloseTo(0.5);
    expect(n).toBe(2);
    f.advance(0.005, () => n++);
    expect(n).toBe(3);
    f.advance(10, () => n++);
    expect(n).toBe(8);
  });
});
