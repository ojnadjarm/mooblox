import { AnimationMixer, LoopOnce, Quaternion, Vector3, type AnimationAction, type AnimationClip, type Mesh, type Object3D } from 'three';
import { CLIP_FOR, type AvatarState } from './clips';
import { IDLE, JUMP, M, motionState, RUN, stepMotion, WALK, type MotionCode } from './motion';

const FADE = 0.15;
const CODE: Readonly<Record<AvatarState, MotionCode>> = { idle: IDLE, walk: WALK, run: RUN, jump: JUMP };
const turn = new Quaternion();
let created = 0;

/** A bone the motion layer moves, with its clip pose saved so the layer never accumulates. */
class Layered {
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(readonly bone: Object3D) {}

  /** Puts back the clip pose before the mixer runs (tracks the clip does not animate keep it). */
  restore(): void {
    this.bone.quaternion.copy(this.q);
    this.bone.scale.copy(this.s);
  }

  /** Saves the clip pose, then adds the pitch, yaw, roll at `m[at..at+2]` (YXZ) and the stretch at `m[stretch]` (< 0: none). */
  apply(m: Float64Array, at: number, stretch: number): void {
    const b = this.bone;
    this.q.copy(b.quaternion);
    this.s.copy(b.scale);
    const px = m[at]! / 2;
    const py = m[at + 1]! / 2;
    const pz = m[at + 2]! / 2;
    const cx = Math.cos(px), sx = Math.sin(px), cy = Math.cos(py), sy = Math.sin(py), cz = Math.cos(pz), sz = Math.sin(pz);
    turn.set(sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz);
    b.quaternion.multiply(turn);
    const st = stretch < 0 ? 0 : m[stretch]!;
    b.scale.y *= 1 + st;
    b.scale.x *= 1 - st * 0.5;
    b.scale.z *= 1 - st * 0.5;
  }
}

/** One character in the world: its model, the clip for each state, and a procedural motion layer on top. */
export class Avatar {
  readonly mixer: AnimationMixer;
  /** Per-kid seed: clip phase, playback rate, glances and breathing. */
  readonly seed: number;
  private readonly actions = new Map<AvatarState, AnimationAction>();
  private current: AvatarState | null = null;
  private readonly torso: Layered | null;
  private readonly head: Layered | null;
  private readonly m: Float64Array;

  constructor(
    readonly root: Object3D,
    clips: readonly AnimationClip[],
    seed?: number,
  ) {
    this.seed = seed ?? created++;
    this.m = motionState(this.seed);
    this.mixer = new AnimationMixer(root);
    for (const [state, name] of Object.entries(CLIP_FOR) as [AvatarState, string][]) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) {
        throw new Error(`mooblox: avatar has no clip ${name}`);
      }
      const action = this.mixer.clipAction(clip);
      if (state === 'jump') {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    }
    const bone = (name: string): Layered | null => {
      const o = root.getObjectByName(name);
      return o ? new Layered(o) : null;
    };
    this.torso = bone('torso');
    this.head = bone('head');
    this.torso?.apply(this.m, M.torsoPitch, -1);
    this.head?.apply(this.m, M.headPitch, -1);
    this.play('idle');
  }

  get state(): AvatarState | null {
    return this.current;
  }

  /** Clip names per state, as bound to the mixer. */
  get clipNames(): Record<AvatarState, string> {
    const names = {} as Record<AvatarState, string>;
    for (const [state, action] of this.actions) {
      names[state] = action.getClip().name;
    }
    return names;
  }

  /** Cross-fades to the clip of `state`; a repeated state keeps playing. Loops start at this kid's own phase. */
  play(state: AvatarState): void {
    if (state === this.current) {
      return;
    }
    const next = this.actions.get(state)!;
    next.reset().play();
    if (state !== 'jump') next.time = this.m[M.phase]! * next.getClip().duration;
    if (this.current) {
      this.actions.get(this.current)!.crossFadeTo(next, FADE, false);
    }
    this.current = state;
  }

  /** Ground speed (m/s; NaN = as authored) and turn rate (rad/s, + = towards +x) for stride rate, lean and bank. */
  setMotion(speed: number, turnRate: number): void {
    this.m[M.speed] = speed;
    this.m[M.turn] = turnRate;
  }

  update(dt: number): void {
    const state = this.current ?? 'idle';
    const m = this.m;
    this.torso?.restore();
    this.head?.restore();
    stepMotion(m, CODE[state], dt);
    this.actions.get(state)!.timeScale = m[M.rate]!;
    this.mixer.update(dt);
    this.torso?.apply(m, M.torsoPitch, M.torsoStretch);
    this.head?.apply(m, M.headPitch, -1);
  }

  /** Frees this avatar's geometry; materials are shared by its kit. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}
