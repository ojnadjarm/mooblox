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

/** The island of one section; `angle` is its bearing from the hub. */
export interface Zone extends Circle {
  readonly sectionId: number;
  readonly angle: number;
  readonly plots: readonly Plot[];
}

export interface WorldLayout {
  readonly hub: Circle;
  readonly spawn: { readonly x: number; readonly z: number };
  readonly zones: readonly Zone[];
  /** Radius of the circle around the origin that holds every zone. */
  readonly extent: number;
}

/** Turns world data into ground geometry; pure and deterministic per course. */
export interface LayoutPolicy {
  layout(world: WorldData): WorldLayout;
}
