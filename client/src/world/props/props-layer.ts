import { Group } from 'three';
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

  /** Re-reads availability and completion of every prop from a fresh world. */
  update(world: WorldData): void {
    const activities = activityMap(world);
    for (const [id, prop] of this.props) {
      const a = activities.get(id);
      if (a) {
        prop.update(a);
      }
    }
  }
}

function activityMap(world: WorldData): Map<number, Activity> {
  return new Map(world.sections.flatMap((s) => s.activities).map((a) => [a.id, a]));
}
