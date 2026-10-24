import type { WorldData } from '../domain/types';

/** A circle on the ground plane (x, z in metres). */
export interface Circle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Where one activity's prop stands; `facing` is the yaw towards its zone centre. */
export interface Plot extends Circle {
  readonly activityId: number;
  readonly sectionId: number;
  readonly facing: number;
}

/** The island of one section; `angle` is its bearing from `anchor`, the hub its bridge starts on. */
export interface Zone extends Circle {
  readonly sectionId: number;
  readonly angle: number;
  readonly anchor: Circle;
  readonly plots: readonly Plot[];
}

/** An always-open bridge between two hubs (indices into `hubs`). */
export interface HubLink {
  readonly from: number;
  readonly to: number;
}

export interface WorldLayout {
  /** The spawn plaza, `hubs[0]`. */
  readonly hub: Circle;
  /** Plaza islands: the hub plus the extra plazas large courses open further out. */
  readonly hubs: readonly Circle[];
  readonly links: readonly HubLink[];
  readonly spawn: { readonly x: number; readonly z: number };
  readonly zones: readonly Zone[];
  /** Radius of the circle around the origin that holds every zone. */
  readonly extent: number;
}

/** Turns world data into ground geometry; pure and deterministic per course. */
export interface LayoutPolicy {
  layout(world: WorldData): WorldLayout;
}
