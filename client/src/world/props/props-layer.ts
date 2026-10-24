import { Group, type Object3D } from 'three';
import type { Activity, WorldData } from '../../domain/types';
import type { WorldLayout } from '../layout';
import type { Prop, PropContext } from './prop';
import type { PropRegistry } from './prop-registry';

/** Every activity's prop on its plot; keeps them in step with the course. */
export class PropsLayer {
  readonly group = new Group();
  private readonly props = new Map<number, Prop>();

  constructor(
    private readonly registry: PropRegistry,
    private readonly ctx: PropContext,
  ) {
    this.group.name = 'props';
    // Hidden props are not drawn: the per-frame matrix pass skips them (a big course has thousands of prop parts).
    const shown: Object3D[] = [];
    const update = this.group.updateMatrixWorld.bind(this.group);
    this.group.updateMatrixWorld = (force?: boolean) => {
      const all = this.group.children;
      shown.length = 0;
      for (const c of all) if (c.visible) shown.push(c);
      this.group.children = shown;
      try {
        update(force);
      } finally {
        this.group.children = all;
      }
    };
  }

  build(world: WorldData, layout: WorldLayout): this {
    const activities = activityMap(world);
    for (const plot of layout.zones.flatMap((z) => z.plots)) {
      const a = activities.get(plot.activityId);
      if (a) {
        const prop = this.registry.resolve(a).create(a, plot, this.ctx);
        this.props.set(a.id, prop);
        this.group.add(prop.root);
      }
    }
    return this;
  }

  get(activityId: number): Prop | undefined {
    return this.props.get(activityId);
  }

  get all(): readonly Prop[] {
    return [...this.props.values()];
  }

  /**
   * Distance LOD for large courses: past `near` a prop drops its sign, flag and padlock, past `far` it is hidden and its
   * coloured pad stands in. Courses with up to `keep` props always show everything.
   */
  cull(x: number, z: number, near: number, far: number, keep: number): void {
    const all = this.props.size <= keep;
    for (const prop of this.props.values()) {
      const dx = prop.root.position.x - x;
      const dz = prop.root.position.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      prop.root.visible = all || d < far;
      prop.detail.visible = all || d < near;
    }
  }

  /** Eases door leaves: the one at activity `near` opens, the rest close. */
  swing(near: number | null, dt: number): void {
    for (const prop of this.props.values()) {
      prop.swing?.(prop.activityId === near, dt);
    }
  }

  /** Re-reads availability and completion of every prop from a fresh world; returns the props that just became done. */
  update(world: WorldData): Prop[] {
    const activities = activityMap(world);
    const done: Prop[] = [];
    for (const [id, prop] of this.props) {
      const a = activities.get(id);
      if (a) {
        const before = prop.state;
        prop.update(a);
        if (before.done === false && prop.state.done === true) done.push(prop);
      }
    }
    return done;
  }
}

function activityMap(world: WorldData): Map<number, Activity> {
  return new Map(world.sections.flatMap((s) => s.activities).map((a) => [a.id, a]));
}
