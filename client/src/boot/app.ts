import { Vector3, type Group, type Mesh } from 'three';
import type { Activity, WorldData } from '../domain/types';
import { ActivityInteraction } from '../interaction/activity-interaction';
import type { OpenerRegistry } from '../interaction/opener';
import type { MoodleGateway } from '../moodle/gateway';
import type { CourseStore } from '../state/course-store';
import { AccessClock } from '../state/access-clock';
import { CourseSync } from '../state/course-sync';
import { completionToggle } from '../ui/completion-toggle';
import { FrameGate } from '../perf/frame-gate';
import { QUALITY, pickTier } from '../perf/quality';
import { QualityManager } from '../perf/quality-manager';
import type { AvatarFactory, AvatarLook } from '../player/avatar-kit';
import { BvhCollider } from '../player/collider';
import { FencedCollider } from '../player/fenced-collider';
import { FollowCamera } from '../player/follow-camera';
import { CombinedInput, KeyboardInput, type InputSource } from '../player/input';
import { Player } from '../player/player';
import { AccessFence, closedSections } from '../world/access-fence';
import { scatterDecor } from '../world/decor';
import { GateLayer, type GateStrings } from '../world/gates/gate-layer';
import { structureKey, shiftFor } from '../world/rebuild';
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
import { Guide, type GuideStrings } from '../tutor/guide';
import type { Tutor } from '../tutor/tutor';
import { Palette } from '../world/palette';
import { AvatarPicker, type AvatarPickerStrings } from '../ui/avatar-picker';
import { BookController } from '../ui/book-controller';
import { TouchControls } from '../ui/touch-controls';
import { Stage } from '../world/stage';

/** Runs after a structural rebuild with the old and the new layout. */
export type RebuildListener = (before: WorldLayout, after: WorldLayout) => void;

/** The running world, handed to later wiring (player, UI) and to the dev page. */
export interface WorldView {
  readonly world: WorldData;
  readonly layout: WorldLayout;
  readonly stage: Stage;
  readonly gate: FrameGate;
  readonly islands: Group;
  readonly props: PropsLayer;
  readonly gates: GateLayer;
  readonly fence: AccessFence;
  readonly kit: MaterialKit;
  readonly quality: QualityManager;
  /** Shows a fresh course: locks, gates and completion; rebuilds the islands when sections or activities came or went. */
  apply(world: WorldData): void;
  /** Adds a listener for structural rebuilds; returns its remover. */
  onRebuild(listener: RebuildListener): () => void;
  /** Hands the camera from the overview to the caller. */
  stopOverview(): void;
  /** Adds a per-frame step that runs before the render; returns its remover. */
  onFrame(step: (dt: number) => void): () => void;
}

/** Builds the island scene for one course inside `root` and starts the render loop. */
export function startWorld(root: HTMLElement, world: WorldData, gateStrings?: GateStrings): WorldView {
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'hidden', touchAction: 'none' });
  const params = new URLSearchParams(location.search);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const tier = pickTier({ query: params.get('quality'), memoryGb: memory, cores: navigator.hardwareConcurrency || 4, coarse });
  const settings = QUALITY[tier];
  const kit = new MaterialKit(settings.materials);
  const stage = new Stage(root, kit, { antialias: settings.antialias, shadowMapSize: settings.shadowMapSize });
  const registry = createPropRegistry();
  const signs = new CanvasSignPainter(() => gate.invalidate());
  let current = world;
  let layout = new IslandLayout().layout(world);
  let islands = new IslandBuilder(kit).build(world, layout, scatterDecor(layout, world.courseId));
  let props = new PropsLayer(registry, { kit, signs }).build(world, layout);
  let key = structureKey(world);
  const gates = new GateLayer(kit, gateStrings).build(world, layout);
  const fence = new AccessFence(layout);
  fence.setClosed(closedSections(world));
  stage.add(islands);
  stage.add(props.group);
  stage.add(gates.group);
  const rebuilt = new Set<RebuildListener>();
  let overview = true;

  let e = layout.extent;
  stage.focusShadow(0, 0, e + 4);

  const quality = new QualityManager(stage, tier);
  const overlay = params.get('perf') === '1' ? new PerfOverlay(root, stage.renderer, quality) : null;
  const steps = new Set<(dt: number) => void>();
  steps.add((dt) => {
    if (gates.frame(dt)) {
      gate.invalidate();
    }
  });
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
  const rebuild = (next: WorldData): void => {
    const before = layout;
    islands.removeFromParent();
    islands.traverse((o) => (o as Mesh).geometry?.dispose());
    props.group.removeFromParent();
    for (const prop of props.all) {
      prop.dispose();
    }
    layout = new IslandLayout().layout(next);
    e = layout.extent;
    islands = new IslandBuilder(kit).build(next, layout, scatterDecor(layout, next.courseId));
    props = new PropsLayer(registry, { kit, signs }).build(next, layout);
    stage.add(islands);
    stage.add(props.group);
    gates.build(next, layout);
    fence.setLayout(layout);
    for (const listener of rebuilt) {
      listener(before, layout);
    }
  };
  return {
    get world() {
      return current;
    },
    get layout() {
      return layout;
    },
    stage,
    gate,
    get islands() {
      return islands;
    },
    get props() {
      return props;
    },
    gates,
    fence,
    kit,
    quality,
    apply: (next) => {
      current = next;
      fence.setClosed(closedSections(next));
      const nextKey = structureKey(next);
      if (nextKey !== key) {
        key = nextKey;
        rebuild(next);
      } else {
        props.update(next);
        gates.update(next);
      }
      gate.invalidate();
    },
    onRebuild: (listener) => {
      rebuilt.add(listener);
      return () => rebuilt.delete(listener);
    },
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
  avatars: AvatarFactory,
  look: AvatarLook,
  inputs: readonly InputSource[] = [],
): Promise<Player> {
  const avatar = await avatars.create(look);
  view.stage.add(avatar.root);
  const solid = () => BvhCollider.fromMeshes(view.islands.children.filter((o) => o.name === 'land' || o.name === 'tops'));
  const collider = new FencedCollider(solid(), view.fence);
  const camera = new FollowCamera(view.stage.camera, view.stage.renderer.domElement);
  const spawn = new Vector3(view.layout.spawn.x, SPAWN_HEIGHT, view.layout.spawn.z);
  view.stopOverview();
  const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const touch = new TouchControls(view.stage.canvasHost, coarse || new URLSearchParams(location.search).has('touch'));
  const player = new Player(avatar, collider, spawn, new CombinedInput([new KeyboardInput(), touch, ...inputs]), camera);
  view.onRebuild((before, after) => {
    collider.setInner(solid());
    const p = player.body.position;
    const shift = shiftFor(before, after, p.x, p.z);
    player.shift(shift.x, shift.z);
  });
  view.onFrame((dt) => {
    player.update(dt);
    view.stage.focusShadow(player.body.position.x, player.body.position.z, SHADOW_RADIUS);
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
  const plots = () => view.layout.zones.flatMap((z) => z.plots);
  const toggle = (a: Activity) => completionToggle(a, (done) => course.gateway.setManualCompletion(a.id, done));
  const interaction = new ActivityInteraction(plots, () => course.store.world ?? view.world, openers, panel, prompt, view.gate, toggle);
  const sync = new CourseSync(course.gateway, course.store, view.world.courseId);
  interaction.onClosed(() => void sync.refresh());
  const clock = new AccessClock(() => void sync.refresh());
  clock.schedule(view.world.nextChange);
  course.store.subscribe((world) => {
    view.apply(world);
    interaction.refreshPrompt();
    clock.schedule(world.nextChange);
  });
  view.onFrame(() => interaction.update(player.body.position.x, player.body.position.z));
  new BookController(host, panel, view.gate, () => course.store.world ?? view.world, (id) => goToPlot(view, player, id));
  return interaction;
}

const GUIDE_LOOK: AvatarLook = { skin: 'n', tint: Palette.yellow };
const GUIDE_SPOT = { x: 1.8, z: -4.6 };
const PLAZA_TOP = 0.02;

/** The Guide NPC by the spawn: greets, then names the next step whenever the course changes. */
export async function startGuide(
  view: WorldView,
  player: Player,
  avatars: AvatarFactory,
  tutor: Tutor,
  course: Course,
  strings: GuideStrings,
): Promise<Guide> {
  const avatar = await avatars.create(GUIDE_LOOK);
  const s = view.layout.spawn;
  avatar.root.position.set(s.x + GUIDE_SPOT.x, PLAZA_TOP, s.z + GUIDE_SPOT.z);
  view.stage.add(avatar.root);
  const guide = new Guide(avatar, view.stage.camera, view.stage.canvasHost, strings, (id) => goToPlot(view, player, id));
  guide.say(tutor.greet({ world: course.store.world ?? view.world }));
  course.store.subscribe((world) => guide.say(tutor.nextStep({ world })));
  view.onFrame((dt) => guide.update(dt, player.avatar.root.position));
  return guide;
}

/** The avatar picker: each pick swaps the player's model at once, closing saves the look through `keep`. */
export function startAvatarPicker(
  view: WorldView,
  player: Player,
  avatars: AvatarFactory,
  look: AvatarLook,
  keep: (look: AvatarLook) => Promise<void>,
  strings: AvatarPickerStrings,
): AvatarPicker {
  let latest = 0;
  return new AvatarPicker(view.stage.canvasHost, avatars.bodies, look, strings, {
    opened: () => player.faceCamera(),
    picked: async (next) => {
      const ticket = ++latest;
      const avatar = await avatars.create(next);
      if (ticket === latest) {
        player.setAvatar(avatar).dispose();
        view.gate.invalidate();
      } else {
        avatar.dispose();
      }
    },
    kept: (next) => void keep(next).catch((e: unknown) => console.error('mooblox: saving the avatar failed', e)),
  });
}

const STAND_OFF = 1.6;

/** Puts the player in front of an open activity's prop, facing it; refuses locked ones and closed zones. */
export function goToPlot(view: WorldView, player: Player, activityId: number): boolean {
  const plot = view.layout.zones.flatMap((z) => z.plots).find((p) => p.activityId === activityId);
  const activity = view.world.sections.flatMap((s) => s.activities).find((a) => a.id === activityId);
  if (!plot || !activity?.available || view.fence.isClosed(plot.sectionId)) {
    return false;
  }
  player.teleport(plot.x + Math.sin(plot.facing) * STAND_OFF, plot.z + Math.cos(plot.facing) * STAND_OFF, plot.facing + Math.PI);
  return true;
}

/** Overview camera that keeps the whole island in view, pulling back on portrait screens. */
function frameOverview(stage: Stage, extent: number): void {
  const pull = Math.pow(Math.max(1, 1.4 / stage.camera.aspect), 0.6);
  stage.camera.position.set(-extent * 0.35 * pull, extent * 0.62 * Math.pow(pull, 0.7), extent * 1.05 * pull);
  stage.camera.lookAt(0, -2, 0);
}
