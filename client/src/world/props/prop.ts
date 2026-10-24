import type { Object3D, Texture } from 'three';
import type { Activity } from '../../domain/types';
import type { Plot } from '../layout';
import type { MaterialKit } from '../material-kit';

/** What a prop shows about its activity. `done` is null when completion is not tracked. */
export interface PropState {
  readonly locked: boolean;
  readonly done: boolean | null;
}

/** One activity's object in the world. */
export interface Prop {
  readonly activityId: number;
  readonly key: string;
  readonly root: Object3D;
  /** The near-only parts (name sign, completion flag, padlock), hidden at a distance. */
  readonly detail: Object3D;
  readonly state: PropState;
  /** Re-reads availability and completion from the activity. */
  update(a: Activity): void;
  /** Eases a door leaf open while the player stands at it (props with a door only). */
  swing?(open: boolean, dt: number): void;
  dispose(): void;
}

/** Paints an activity's name sign (icon + name) as a texture. */
export interface SignPainter {
  paint(a: Activity): Texture;
}

/** Shared services every factory builds with. */
export interface PropContext {
  readonly kit: MaterialKit;
  readonly signs: SignPainter;
}

/** Builds the prop of the activities it accepts. */
export interface PropFactory {
  readonly key: string;
  accepts(a: Activity): boolean;
  create(a: Activity, plot: Plot, ctx: PropContext): Prop;
}
