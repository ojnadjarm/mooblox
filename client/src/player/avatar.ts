import { AnimationMixer, LoopOnce, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { CLIP_FOR, type AvatarState } from './clips';

const FADE = 0.15;

/** One character in the world: its model and the clip for each state. */
export class Avatar {
  readonly mixer: AnimationMixer;
  private readonly actions = new Map<AvatarState, AnimationAction>();
  private current: AvatarState | null = null;

  constructor(
    readonly root: Object3D,
    clips: readonly AnimationClip[],
  ) {
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

  /** Cross-fades to the clip of `state`; a repeated state keeps playing. */
  play(state: AvatarState): void {
    if (state === this.current) {
      return;
    }
    const next = this.actions.get(state)!;
    next.reset().play();
    if (this.current) {
      this.actions.get(this.current)!.crossFadeTo(next, FADE, false);
    }
    this.current = state;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
