import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { toWorld } from '../../src/domain/mapper';
import { GuidedWalk } from '../../src/player/guided-walk';
import { NO_INPUT, type InputState } from '../../src/player/input';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { plotRoute, STAND_OFF } from '../../src/world/plot-route';
import { WalkGrid } from '../../src/world/walk-grid';

/** A walker on a plane: moves 0.1 m per read along the world direction of the input. */
function rig(keys: { state: InputState }) {
  const pos = { x: 0, z: 0 };
  const camera = { yaw: 0.7, behind: false };
  let t = 0;
  const walk = new GuidedWalk({ read: () => keys.state }, () => pos, camera, () => (t += 16));
  const step = (): void => {
    const i = walk.read();
    const s = Math.sin(camera.yaw);
    const c = Math.cos(camera.yaw);
    pos.x += (i.x * c - i.z * s) * 0.1;
    pos.z += (-i.x * s - i.z * c) * 0.1;
  };
  return { pos, camera, walk, step };
}

describe('GuidedWalk', () => {
  it('walks the route leg by leg, swings the camera behind and lets go on arrival', () => {
    const r = rig({ state: NO_INPUT });
    r.walk.start([{ x: 5, z: 0, r: 0.3 }, { x: 5, z: 5, r: 0.3 }]);
    expect(r.camera.behind).toBe(true);
    for (let i = 0; i < 200 && r.walk.active; i++) r.step();
    expect(r.walk.active).toBe(false);
    expect(Math.hypot(r.pos.x - 5, r.pos.z - 5)).toBeLessThan(0.4);
    expect(r.camera.behind).toBe(false);
  });

  it('any movement key cancels it and hands over the keys', () => {
    const keys = { state: NO_INPUT };
    const r = rig(keys);
    r.walk.start([{ x: 20, z: 0, r: 0.3 }]);
    r.step();
    keys.state = { x: 0, z: 1, run: false, jump: false };
    expect(r.walk.read()).toBe(keys.state);
    expect(r.walk.active).toBe(false);
    expect(r.camera.behind).toBe(false);
  });

  it('gives up when it makes no progress for 8 s', () => {
    const pos = { x: 0, z: 0 };
    let t = 0;
    const walk = new GuidedWalk({ read: () => NO_INPUT }, () => pos, { yaw: 0, behind: false }, () => t);
    walk.start([{ x: 9, z: 0, r: 0.3 }]);
    t = 9000;
    walk.read();
    expect(walk.active).toBe(false);
  });
});

describe('plotRoute', () => {
  const world = toWorld(fixture);
  const layout = new IslandLayout(CAMPUS.size).layout(world);
  const dressing = designWorld(layout, world.courseId, CAMPUS.palette);
  const grid = new WalkGrid(layout, dressing);

  it('reaches every plot of the demo course from the spawn, ending with a step towards the prop', () => {
    const plots = layout.zones.flatMap((z) => z.plots);
    expect(plots.length).toBeGreaterThan(3);
    for (const plot of plots) {
      const route = plotRoute(grid, dressing.start, plot)!;
      expect(route, `cm ${plot.activityId}`).not.toBeNull();
      const stand = route.at(-2)!;
      expect(Math.hypot(stand.x - plot.x, stand.z - plot.z)).toBeCloseTo(STAND_OFF, 5);
      expect(route.at(-1)).toMatchObject({ x: plot.x, z: plot.z });
    }
  });
});
