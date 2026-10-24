import { Vector3, type Group } from 'three';
import type { Activity, WorldData } from '../domain/types';
import { ActivityInteraction } from '../interaction/activity-interaction';
import type { OpenerRegistry } from '../interaction/opener';
import type { MoodleGateway } from '../moodle/gateway';
import type { CourseStore } from '../state/course-store';
import { CourseSync } from '../state/course-sync';
import { completionToggle } from '../ui/completion-toggle';
import { FrameGate } from '../perf/frame-gate';
import { QUALITY, pickTier } from '../perf/quality';
import { QualityManager } from '../perf/quality-manager';
import { AvatarKit, type AvatarLook } from '../player/avatar-kit';
import { BvhCollider } from '../player/collider';
import { FollowCamera } from '../player/follow-camera';
import { CombinedInput, KeyboardInput, type InputSource } from '../player/input';
import { Player } from '../player/player';
import { scatterDecor } from '../world/decor';
import { IslandBuilder } from '../world/island-builder';
import { IslandLayout } from '../world/island-layout';
import type { WorldLayout } from '../world/layout';
import { MaterialKit } from '../world/material-kit';
import { createPropRegistry } from '../world/props/catalog';
import { PropsLayer } from '../world/props/props-layer';
import { CanvasSignPainter } from '../world/props/sign-painter';
import { Panel } from '../ui/panel';
import { PerfOverlay } from '../ui/perf-overlay';
import { ActivityPrompt } from '../ui/prompt';
import { TouchControls } from '../ui/touch-controls';
import { Stage } from '../world/stage';

/** The running world, handed to later wiring (player, UI) and to the dev page. */
export interface WorldView {
  readonly world: WorldData;
  readonly layout: WorldLayout;
  readonly stage: Stage;
  readonly gate: FrameGate;
  readonly islands: Group;
  readonly props: PropsLayer;
  readonly kit: MaterialKit;
  readonly quality: QualityManager;
  /** Hands the camera from the overview to the caller. */
  stopOverview(): void;
  /** Adds a per-frame step that runs before the render; returns its remover. */
  onFrame(step: (dt: number) => void): () => void;
}

/** Builds the island scene for one course inside `root` and starts the render loop. */
export function startWorld(root: HTMLElement, world: WorldData): WorldView {
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'hidden', touchAction: 'none' });
  const params = new URLSearchParams(location.search);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const tier = pickTier({ query: params.get('quality'), memoryGb: memory, cores: navigator.hardwareConcurrency || 4, coarse });
  const settings = QUALITY[tier];
  const kit = new MaterialKit(settings.materials);
  const stage = new Stage(root, kit, { antialias: settings.antialias, shadowMapSize: settings.shadowMapSize });
  const layout = new IslandLayout().layout(world);
  const islands = new IslandBuilder(kit).build(world, layout, scatterDecor(layout, world.courseId));
  stage.add(islands);
  const props = new PropsLayer(createPropRegistry(), { kit, signs: new CanvasSignPainter(() => gate.invalidate()) }).build(world, layout);
  stage.add(props.group);
  let overview = true;

  const e = layout.extent;
  stage.focusShadow(0, 0, e + 4);

  const quality = new QualityManager(stage, tier);
  const overlay = params.get('perf') === '1' ? new PerfOverlay(root, stage.renderer, quality) : null;
  const steps = new Set<(dt: number) => void>();
  const gate = new FrameGate((dt) => {
    for (const step of steps) {
      step(dt);
    }
    stage.render();
    if (dt > 0) {
      quality.frame(dt * 1000);
    }
    overlay?.frame();
  });
  const resize = (): void => {
    quality.apply();
    if (overview) {
      frameOverview(stage, e);
    }
    gate.invalidate();
  };
  window.addEventListener('resize', resize);
  resize();
  gate.start();
  requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset['ready'] = '1')));
  return {
    world,
    layout,
    stage,
    gate,
    islands,
    props,
    kit,
    quality,
    stopOverview: () => {
      overview = false;
    },
    onFrame: (step) => {
      steps.add(step);
      return () => steps.delete(step);
    },
  };
}

const SPAWN_HEIGHT = 2;
const SHADOW_RADIUS = 30;

/** Loads the avatar and starts the local player at the spawn, driven by the keyboard plus `inputs`. */
export async function startPlayer(
  view: WorldView,
  assetBase: string,
  look: AvatarLook,
  inputs: readonly InputSource[] = [],
): Promise<Player> {
  const kit = await AvatarKit.load(assetBase);
  const avatar = await kit.create(look);
  view.stage.add(avatar.root);
  const collider = BvhCollider.fromMeshes(view.islands.children.filter((o) => o.name === 'land' || o.name === 'tops'));
  const camera = new FollowCamera(view.stage.camera, view.stage.renderer.domElement);
  const spawn = new Vector3(view.layout.spawn.x, SPAWN_HEIGHT, view.layout.spawn.z);
  view.stopOverview();
  const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const touch = new TouchControls(view.stage.canvasHost, coarse || new URLSearchParams(location.search).has('touch'));
  const player = new Player(avatar, collider, spawn, new CombinedInput([new KeyboardInput(), touch, ...inputs]), camera);
  view.onFrame((dt) => {
    player.update(dt);
    view.stage.focusShadow(avatar.root.position.x, avatar.root.position.z, SHADOW_RADIUS);
  });
  return player;
}

/** The course the world shows and the gateway that changes it. */
export interface Course {
  readonly store: CourseStore;
  readonly gateway: MoodleGateway;
}

/** Prompts at each plot, opens activities in the panel, re-reads the course after each close. */
export function startActivities(view: WorldView, player: Player, openers: OpenerRegistry, course: Course): ActivityInteraction {
  const host = view.stage.canvasHost;
  const panel = new Panel(host);
  const prompt = new ActivityPrompt(host, () => void interaction.openCurrent());
  const plots = view.layout.zones.flatMap((z) => z.plots);
  const toggle = (a: Activity) => completionToggle(a, (done) => course.gateway.setManualCompletion(a.id, done));
  const interaction = new ActivityInteraction(plots, () => course.store.world ?? view.world, openers, panel, prompt, view.gate, toggle);
  const sync = new CourseSync(course.gateway, course.store, view.world.courseId);
  interaction.onClosed(() => void sync.refresh());
  course.store.subscribe((world) => {
    view.props.update(world);
    interaction.refreshPrompt();
    view.gate.invalidate();
  });
  view.onFrame(() => interaction.update(player.body.position.x, player.body.position.z));
  return interaction;
}

/** Overview camera that keeps the whole island in view, pulling back on portrait screens. */
function frameOverview(stage: Stage, extent: number): void {
  const pull = Math.pow(Math.max(1, 1.4 / stage.camera.aspect), 0.6);
  stage.camera.position.set(-extent * 0.35 * pull, extent * 0.62 * Math.pow(pull, 0.7), extent * 1.05 * pull);
  stage.camera.lookAt(0, -2, 0);
}
