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
  private readonly move = { x: 0, z: 0, run: false, jump: false };
  private readonly tick = (): void => {
    this.prev.copy(this.body.position);
    stepBody(this.body, this.move, Physics.step, this.collider);
    if (this.body.position.y < KILL_Y) {
      this.respawn();
    }
  };

  constructor(
    private model: Avatar,
    private readonly collider: Collider,
    private readonly spawn: Vector3,
    private readonly input: InputSource,
    readonly camera: FollowCamera,
  ) {
    this.body = { position: spawn.clone(), velocity: new Vector3(), onGround: false };
    this.prev.copy(spawn);
    model.root.position.copy(spawn);
    camera.follow(spawn, 0, true);
  }

  get avatar(): Avatar {
    return this.model;
  }

  /** Swaps the model in place (same spot, heading and state); returns the old one for disposal. */
  setAvatar(next: Avatar): Avatar {
    const old = this.model;
    next.root.position.copy(old.root.position);
    next.root.rotation.y = old.root.rotation.y;
    old.root.parent?.add(next.root);
    old.root.removeFromParent();
    this.model = next;
    return old;
  }

  /** Swings the camera round to the avatar's front. */
  faceCamera(): void {
    this.camera.yaw = this.facing;
  }

  update(dt: number): void {
    const raw = this.input.read();
    const dir = this.camera.toWorld(raw.x, raw.z);
    const move = this.move;
    move.x = dir.x;
    move.z = dir.z;
    move.run = raw.run;
    move.jump = raw.jump;
    const alpha = this.fixed.advance(dt, this.tick);
    const root = this.avatar.root;
    root.position.lerpVectors(this.prev, this.body.position, alpha);
    const moving = move.x * move.x + move.z * move.z > 0.01;
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

  /** Moves the player to (x, z), facing `facing`, with the camera snapped behind. */
  teleport(x: number, z: number, facing: number): void {
    this.body.position.set(x, this.spawn.y, z);
    this.body.velocity.set(0, 0, 0);
    this.prev.copy(this.body.position);
    this.facing = facing;
    this.camera.yaw = facing + Math.PI;
    this.avatar.root.position.copy(this.body.position);
    this.camera.follow(this.body.position, 0, true);
  }

  /** Moves the player and its camera by (dx, dz), keeping height, heading and speed. */
  shift(dx: number, dz: number): void {
    if (dx === 0 && dz === 0) {
      return;
    }
    this.body.position.x += dx;
    this.body.position.z += dz;
    this.prev.copy(this.body.position);
    this.avatar.root.position.copy(this.body.position);
    this.camera.follow(this.body.position, 0, true);
  }

  respawn(): void {
    this.body.position.copy(this.spawn);
    this.body.velocity.set(0, 0, 0);
    this.prev.copy(this.spawn);
  }
}
