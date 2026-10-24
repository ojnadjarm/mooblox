import { Vector3 } from 'three';
import type { Avatar } from './avatar';
import type { Collider } from './collider';
import { Physics, stepBody, type Body } from './controller';
import { FixedStep } from './fixed-step';
import { accelerate, Feel, JumpGate, landing, squash, stretch } from './game-feel';
import type { FollowCamera } from './follow-camera';
import type { InputSource } from './input';

const KILL_Y = -6;
const TURN = 12;

/** Where the feet kicked up dust: a footstep (n = 1), a jump or a landing (more puffs, stronger). */
export type FeetListener = (x: number, y: number, z: number, n: number, strength: number) => void;

/** The local player: fixed-step capsule body with eased speed and forgiving jumps, squashing avatar, follow camera. */
export class Player {
  readonly body: Body;
  /** Called when the feet kick up dust. */
  onFeet: FeetListener | null = null;
  private readonly prev = new Vector3();
  private readonly fixed = new FixedStep(Physics.step);
  private facing = Math.PI;
  private readonly move = { x: 0, z: 0, run: false, jump: false };
  /** What stepBody gets: the eased velocity as a run-speed fraction, and the gate's jump. */
  private readonly step = { x: 0, z: 0, run: true, jump: false };
  private readonly velocity = { x: 0, z: 0 };
  private readonly gate = new JumpGate();
  private jumpHeld = false;
  private sinceLand = Infinity;
  private sinceJump = Infinity;
  private landStrength = 0;
  private stride = 0;
  private readonly tick = (): void => {
    const b = this.body;
    this.prev.copy(b.position);
    const want = this.move.run ? Physics.run : Physics.walk;
    accelerate(this.velocity, this.move.x * want, this.move.z * want, b.onGround, Physics.step);
    const st = this.step;
    st.x = this.velocity.x / Physics.run;
    st.z = this.velocity.z / Physics.run;
    st.jump = this.gate.step(Physics.step, b.onGround);
    const wasGround = b.onGround;
    const fall = -b.velocity.y;
    stepBody(b, st, Physics.step, this.collider);
    if (st.jump) {
      this.sinceJump = 0;
      this.onFeet?.(b.position.x, b.position.y, b.position.z, 3, 0.4);
    }
    if (!wasGround && b.onGround) {
      this.landStrength = landing(fall);
      this.sinceLand = 0;
      if (this.landStrength > 0) this.onFeet?.(b.position.x, b.position.y, b.position.z, 4 + Math.round(this.landStrength * 4), this.landStrength);
    }
    if (b.position.y < KILL_Y) {
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
    if (raw.jump && !this.jumpHeld) this.gate.press();
    this.jumpHeld = raw.jump;
    const alpha = this.fixed.advance(dt, this.tick);
    const root = this.avatar.root;
    root.position.lerpVectors(this.prev, this.body.position, alpha);
    const moving = move.x * move.x + move.z * move.z > 0.01;
    let turned = 0;
    if (moving) {
      const target = Math.atan2(move.x, move.z);
      const delta = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      turned = delta * Math.min(1, TURN * dt);
      this.facing += turned;
    }
    root.rotation.y = this.facing;
    this.sinceLand += dt;
    this.sinceJump += dt;
    const s = this.sinceJump < this.sinceLand ? stretch(this.sinceJump) : squash(this.sinceLand, this.landStrength);
    root.scale.set(s.xz, s.y, s.xz);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.avatar.setMotion(speed, dt > 0 ? turned / dt : 0);
    const running = speed > Physics.walk + 0.5;
    this.avatar.play(!this.body.onGround ? 'jump' : speed > 0.4 ? (running ? 'run' : 'walk') : 'idle');
    this.stride += running && this.body.onGround ? dt : 0;
    if (this.stride >= Feel.stride) {
      this.stride = 0;
      this.onFeet?.(root.position.x - Math.sin(this.facing) * 0.4, root.position.y, root.position.z - Math.cos(this.facing) * 0.4, 1, 0.2);
    }
    this.avatar.update(dt);
    this.camera.follow(root.position, dt, false, this.velocity);
  }

  /** Moves the player to (x, z), facing `facing`, with the camera snapped behind. */
  teleport(x: number, z: number, facing: number): void {
    this.body.position.set(x, this.spawn.y, z);
    this.body.velocity.set(0, 0, 0);
    this.velocity.x = this.velocity.z = 0;
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
    this.velocity.x = this.velocity.z = 0;
    this.prev.copy(this.spawn);
  }
}
