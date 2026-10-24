import { Vector3 } from 'three';
import type { Avatar } from './avatar';
import type { Collider } from './collider';
import { Physics, stepBody, type Body } from './controller';
import { FixedStep } from './fixed-step';
import type { FollowCamera } from './follow-camera';
import type { InputSource } from './input';

const KILL_Y = -6;
const TURN = 12;

/** The local player: fixed-step capsule body, interpolated avatar, follow camera. */
export class Player {
  readonly body: Body;
  private readonly prev = new Vector3();
  private readonly fixed = new FixedStep(Physics.step);
  private facing = Math.PI;

  constructor(
    readonly avatar: Avatar,
    private readonly collider: Collider,
    private readonly spawn: Vector3,
    private readonly input: InputSource,
    readonly camera: FollowCamera,
  ) {
    this.body = { position: spawn.clone(), velocity: new Vector3(), onGround: false };
    this.prev.copy(spawn);
    avatar.root.position.copy(spawn);
    camera.follow(spawn, 0, true);
  }

  update(dt: number): void {
    const raw = this.input.read();
    const dir = this.camera.toWorld(raw.x, raw.z);
    const move = { x: dir.x, z: dir.z, run: raw.run, jump: raw.jump };
    const alpha = this.fixed.advance(dt, () => {
      this.prev.copy(this.body.position);
      stepBody(this.body, move, Physics.step, this.collider);
      if (this.body.position.y < KILL_Y) {
        this.respawn();
      }
    });
    const root = this.avatar.root;
    root.position.lerpVectors(this.prev, this.body.position, alpha);
    const moving = Math.hypot(move.x, move.z) > 0.1;
    if (moving) {
      const target = Math.atan2(move.x, move.z);
      const delta = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += delta * Math.min(1, TURN * dt);
    }
    root.rotation.y = this.facing;
    this.avatar.play(!this.body.onGround ? 'jump' : moving ? (move.run ? 'run' : 'walk') : 'idle');
    this.avatar.update(dt);
    this.camera.follow(root.position, dt);
  }

  respawn(): void {
    this.body.position.copy(this.spawn);
    this.body.velocity.set(0, 0, 0);
    this.prev.copy(this.spawn);
  }
}
