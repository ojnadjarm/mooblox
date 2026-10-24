/** Something the streamer builds in slices near the player and frees far away: one district island. */
export interface StreamUnit {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly isBuilt: boolean;
  /** Runs one slice of the build; true once complete. */
  step(): boolean;
  /** Builds every remaining slice now. */
  finish(): void;
  /** Frees the build. */
  unload(): void;
}

/** How far unit `index` is from the focus at (x, z), in the units `keep` and `drop` use; Infinity = not wanted. */
export type StreamMetric = (unit: StreamUnit, index: number, x: number, z: number) => number;

/** Default metric: distance from the focus to the unit's edge. */
export const edgeMetric: StreamMetric = (u, _i, x, z) => edge(u, x, z);

/** How far the streamer keeps districts and how long one frame may build. */
export interface StreamPolicy {
  /** Milliseconds of building per frame. */
  readonly sliceMs: number;
  /** Units whose edge is within this distance get built (nearest first). */
  readonly keep: number;
  /** Built units whose edge is past this distance are freed (>= keep, the gap stops build/free churn). */
  readonly drop: number;
}

/**
 * District streaming: builds the units nearest the focus first, a few milliseconds per frame, and frees the ones that
 * fell far behind. Gates, locks and props never wait for it: they are built from the layout data, not from these meshes.
 */
export class DistrictStreamer {
  private changed = false;

  constructor(
    private readonly units: readonly StreamUnit[],
    private readonly policy: StreamPolicy,
    private readonly now: () => number = () => performance.now(),
    /** Which units are near: edge distance by default, the island streamer's live set for one island at a time. */
    private readonly metric: StreamMetric = edgeMetric,
  ) {}

  /** Units not yet built within the keep distance of the last focus. */
  pending = 0;

  /** Builds every unit within `distance` (edge) of (x, z) at once: the first playable area. */
  buildNear(x: number, z: number, distance: number): void {
    for (const u of this.units) {
      if (!u.isBuilt && edge(u, x, z) <= distance) u.finish();
    }
  }

  /**
   * One frame of streaming around (x, z): frees far units, then builds the nearest unbuilt ones until the slice is spent.
   * `all` keeps and builds everything (overview). Returns true when the scene changed.
   */
  pump(x: number, z: number, all = false): boolean {
    const keep = all ? Infinity : this.policy.keep;
    const drop = all ? Infinity : this.policy.drop;
    this.changed = false;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      if (u.isBuilt && !all && this.metric(u, i, x, z) > drop) {
        u.unload();
        this.changed = true;
      }
    }
    let pending = 0;
    let nearest = -1;
    let best = Infinity;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      const d = all ? edge(u, x, z) : this.metric(u, i, x, z);
      if (u.isBuilt || d > keep) continue;
      pending++;
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    this.pending = pending;
    if (nearest < 0) return this.changed;
    const end = this.now() + this.policy.sliceMs;
    // Keep working on the nearest unit; pick the next nearest once it is done, until the slice is spent.
    while (nearest >= 0 && this.now() < end) {
      if (this.units[nearest]!.step()) {
        this.changed = true;
        this.pending--;
        nearest = this.nearestUnbuilt(x, z, keep, all);
      }
    }
    return this.changed;
  }

  /** Builds every wanted unit now (a teleport or a new current island must not wait for the slices). */
  finishWanted(x: number, z: number, upTo = 0): void {
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      if (!u.isBuilt && this.metric(u, i, x, z) <= upTo) u.finish();
    }
  }

  private nearestUnbuilt(x: number, z: number, keep: number, all: boolean): number {
    let nearest = -1;
    let best = Infinity;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      const d = all ? edge(u, x, z) : this.metric(u, i, x, z);
      if (!u.isBuilt && d <= keep && d < best) {
        best = d;
        nearest = i;
      }
    }
    return nearest;
  }
}

function edge(u: StreamUnit, x: number, z: number): number {
  const dx = u.x - x;
  const dz = u.z - z;
  return Math.sqrt(dx * dx + dz * dz) - u.radius;
}
