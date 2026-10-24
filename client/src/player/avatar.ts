import { AnimationMixer, LoopOnce, type AnimationAction, type AnimationClip, type Mesh, type Object3D } from 'three';
import { focus, sense } from './attention';
import { CLIP_FOR, type AvatarState } from './clips';
import { A, actState, IDLE_ACTS, KEEP, STOP, stepActs } from './idle-acts';
import { Layered } from './layered';
import { IDLE, JUMP, M, motionState, RUN, stepMotion, WALK, type MotionCode } from './motion';

const FADE = 0.15;
const CODE: Readonly<Record<AvatarState, MotionCode>> = { idle: IDLE, walk: WALK, run: RUN, jump: JUMP, fall: JUMP };
let created = 0;

/** One character in the world: its model, the clip for each state, idle acts now and then, and a procedural motion layer on top. */
export class Avatar {
  readonly mixer: AnimationMixer;
  /** Per-kid seed: clip phase, playback rate, glances and breathing. */
  readonly seed: number;
  private readonly actions = new Map<AvatarState, AnimationAction>();
  private current: AvatarState | null = null;
  private readonly torso: Layered | null;
  private readonly head: Layered | null;
  private readonly m: Float64Array;
  /** Idle acts the clips include (null = missing), the act state, and the act playing. */
  private readonly acts: (AnimationAction | null)[];
  private readonly a: Float64Array;
  private act: AnimationAction | null = null;
  private readonly hasAct = (i: number): boolean => this.acts[i] !== null;

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
      if (state === 'jump' || state === 'fall') {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    }
    this.a = actState(this.seed);
    this.acts = IDLE_ACTS.map(({ clip }) => {
      const c = clips.find((x) => x.name === clip);
      if (!c) return null;
      const action = this.mixer.clipAction(c);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      return action;
    });
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

  /** Cross-fades to the clip of `state` (from an act if one plays); a repeated state keeps playing. Loops start at this kid's own phase. */
  play(state: AvatarState): void {
    if (state === this.current) {
      return;
    }
    const next = this.actions.get(state)!;
    next.reset().play();
    if (state !== 'jump' && state !== 'fall') next.time = this.m[M.phase]! * next.getClip().duration;
    const from = this.act ?? (this.current ? this.actions.get(this.current)! : null);
    from?.crossFadeTo(next, FADE, false);
    this.act = null;
    this.a[A.playing] = -1;
    this.current = state;
  }

  /** The idle act playing (its clip name), or null. */
  get acting(): string | null {
    return this.act?.getClip().name ?? null;
  }

  /** Ground speed (m/s; NaN = as authored), turn rate (rad/s, + = towards +x) and vertical speed (m/s, + up; NaN = none) for stride rate, lean, bank and air tilt. */
  setMotion(speed: number, turnRate: number, verticalSpeed = NaN): void {
    this.m[M.speed] = speed;
    this.m[M.turn] = turnRate;
    this.m[M.vy] = verticalSpeed;
  }

  /** Plays idle act `i` now if standing and the rig has it (an emote); false otherwise. */
  emote(i: number): boolean {
    if (this.current !== 'idle' || !this.acts[i]) return false;
    this.a[A.playing] = i;
    this.startAct(i);
    return true;
  }

  update(dt: number): void {
    const state = this.current ?? 'idle';
    const m = this.m;
    this.torso?.restore();
    this.head?.restore();
    sense(m, this.root, this);
    stepMotion(m, CODE[state], dt);
    this.stepAct(state, dt);
    this.actions.get(state)!.timeScale = m[M.rate]!;
    this.mixer.update(dt);
    this.torso?.apply(m, M.torsoPitch, M.torsoStretch);
    this.head?.apply(m, M.headPitch, -1);
  }

  /** Starts an idle act or fades it back to the idle clip, as the act step says. */
  private stepAct(state: AvatarState, dt: number): void {
    const a = this.a;
    a[A.attend] = this.m[M.attend]!;
    a[A.cue] = focus.owner === this ? -1 : focus.cue;
    a[A.cueAge] = focus.cueAge;
    a[A.cueId] = focus.cueId;
    const next = stepActs(a, this.seed, state === 'idle', dt, this.hasAct);
    if (next === KEEP) return;
    const idle = this.actions.get('idle')!;
    if (next === STOP) {
      if (this.act && state === 'idle') {
        idle.reset().play();
        idle.time = this.m[M.phase]! * idle.getClip().duration;
        this.act.crossFadeTo(idle, FADE, false);
      }
      this.act = null;
      return;
    }
    this.startAct(next);
  }

  /** Cross-fades from the idle clip (or the act playing) into act `i`. */
  private startAct(i: number): void {
    const act = this.acts[i]!;
    act.reset().play();
    (this.act ?? this.actions.get('idle')!).crossFadeTo(act, FADE, false);
    this.act = act;
    this.a[A.left] = act.getClip().duration - FADE;
  }

  /** Frees this avatar's geometry; materials are shared by its kit. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}
