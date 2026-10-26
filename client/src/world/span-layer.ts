import { Group, type Box3, type Object3D } from 'three';
import type { Circle } from './layout';

/** One bridge's build as the span layer drives it (a `DistrictBuild` over the bridge's own district). */
export interface SpanBuild<C> {
  readonly group: Object3D;
  readonly district: { readonly island: Circle };
  readonly isBuilt: boolean;
  readonly busy: boolean;
  readonly collider: C | null;
  readonly bounds: Box3;
  step(): boolean;
  finish(): void;
  unload(): void;
}

/**
 * Every bridge as its own small build, always resident and drawn at full detail on every tier and at every distance (the haze
 * still melts a far one into the sky): the islands at either end stream and fade, the way across never changes. Spans build
 * in background slices nearest the player first; one the player is about to reach is finished at once.
 */
export class SpanLayer<C> {
  readonly group = new Group();

  constructor(private readonly builds: readonly SpanBuild<C>[]) {
    this.group.name = 'spans';
    for (const b of builds) this.group.add(b.group);
  }

  /** Runs the nearest unbuilt span's next slices through `run`; returns the span that finished, if any (its solids are new). */
  step(x: number, z: number, run: (job: () => boolean) => void): SpanBuild<C> | null {
    let next: SpanBuild<C> | null = null;
    let best = Infinity;
    for (const b of this.builds) {
      const d = edge(b.district.island, x, z);
      if (!b.isBuilt && !b.busy && d < best) {
        best = d;
        next = b;
      }
    }
    if (!next) return null;
    const b = next;
    run(() => b.step() || b.busy);
    return b.isBuilt ? b : null;
  }

  /** Finishes every unbuilt span within `reach` m of (x, z) now, inline; returns them. */
  finishNear(x: number, z: number, reach: number): SpanBuild<C>[] {
    const done: SpanBuild<C>[] = [];
    for (const b of this.builds) {
      if (b.isBuilt || edge(b.district.island, x, z) > reach) continue;
      b.finish();
      done.push(b);
    }
    return done;
  }

  /** Shows the spans not wholly in the haze (edge distance from (x, z) under `hidden`); every span when `all`. */
  cull(x: number, z: number, hidden: number, all: boolean): void {
    for (const b of this.builds) b.group.visible = all || edge(b.district.island, x, z) < hidden;
  }

  /** Frees every span (a rebuilt world makes new ones). */
  unload(): void {
    for (const b of this.builds) b.unload();
  }

  /** The built spans' colliders with their bounds. */
  parts(): { collider: C; bounds: Box3 }[] {
    const out: { collider: C; bounds: Box3 }[] = [];
    for (const b of this.builds) if (b.isBuilt && b.collider) out.push({ collider: b.collider, bounds: b.bounds });
    return out;
  }
}

function edge(c: Circle, x: number, z: number): number {
  return Math.hypot(c.x - x, c.z - z) - c.radius;
}
