import type { WorldData } from '../domain/types';
import { FrameGate } from '../perf/frame-gate';
import { scatterDecor } from '../world/decor';
import { IslandBuilder } from '../world/island-builder';
import { IslandLayout } from '../world/island-layout';
import type { WorldLayout } from '../world/layout';
import { MaterialKit } from '../world/material-kit';
import { Stage } from '../world/stage';

/** The running world, handed to later wiring (player, UI) and to the dev page. */
export interface WorldView {
  readonly world: WorldData;
  readonly layout: WorldLayout;
  readonly stage: Stage;
  readonly gate: FrameGate;
}

/** Builds the island scene for one course inside `root` and starts the render loop. */
export function startWorld(root: HTMLElement, world: WorldData): WorldView {
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'hidden', touchAction: 'none' });
  const kit = new MaterialKit('standard');
  const stage = new Stage(root, kit, { antialias: true, shadowMapSize: 2048 });
  const layout = new IslandLayout().layout(world);
  stage.add(new IslandBuilder(kit).build(world, layout, scatterDecor(layout, world.courseId)));

  const e = layout.extent;
  stage.focusShadow(0, 0, e + 4);

  const gate = new FrameGate(() => stage.render());
  const resize = (): void => {
    stage.resize(Math.min(window.devicePixelRatio || 1, 2));
    frameOverview(stage, e);
    gate.invalidate();
  };
  window.addEventListener('resize', resize);
  resize();
  gate.start();
  requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset['ready'] = '1')));
  return { world, layout, stage, gate };
}

/** Overview camera that keeps the whole island in view, pulling back on portrait screens. */
function frameOverview(stage: Stage, extent: number): void {
  const pull = Math.pow(Math.max(1, 1.4 / stage.camera.aspect), 0.6);
  stage.camera.position.set(-extent * 0.35 * pull, extent * 0.62 * Math.pow(pull, 0.7), extent * 1.05 * pull);
  stage.camera.lookAt(0, -2, 0);
}
