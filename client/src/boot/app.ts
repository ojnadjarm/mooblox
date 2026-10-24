import { Box3, Fog, Group, Vector3, type Mesh, type Object3D, type ShaderMaterial } from 'three';
import type { Activity, WorldData } from '../domain/types';
import { ActivityInteraction } from '../interaction/activity-interaction';
import type { OpenerRegistry } from '../interaction/opener';
import type { MoodleGateway } from '../moodle/gateway';
import type { CourseStore } from '../state/course-store';
import { AccessClock } from '../state/access-clock';
import { CourseSync } from '../state/course-sync';
import { completionToggle } from '../ui/completion-toggle';
import { FrameGate } from '../perf/frame-gate';
import { gpuName } from '../perf/gpu';
import { QUALITY, pickTier, type QualityTier } from '../perf/quality';
import { QualityManager } from '../perf/quality-manager';
import type { AvatarFactory, AvatarLook } from '../player/avatar-kit';
import { BvhCollider } from '../player/collider';
import { FencedCollider } from '../player/fenced-collider';
import { Dust } from '../player/dust';
import { FollowCamera } from '../player/follow-camera';
import { CombinedInput, KeyboardInput, type InputSource } from '../player/input';
import { Player } from '../player/player';
import { AccessFence, closedSections } from '../world/access-fence';
import { GateLayer, type GateStrings } from '../world/gates/gate-layer';
import { structureKey, shiftFor } from '../world/rebuild';
import { IslandBuilder } from '../world/island-builder';
import { IslandLayout } from '../world/island-layout';
import type { Plot, WorldLayout } from '../world/layout';
import { designWorld, type Dressing } from '../world/dressing';
import { CAMPUS } from '../world/look';
import type { ModelLibrary } from '../world/model-library';
import { buildGlow, cullDistricts, DETAIL_DISTANCE, DistrictBuild, MINOR_DISTANCE } from '../world/scenery';
import { DistrictStreamer } from '../world/district-streamer';
import { CompositeCollider, type ColliderPart } from '../player/composite-collider';
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
  /** The designer's dressing of the current layout (paths, life spots, obstacles). */
  readonly dressing: Dressing;
  /** Static world collision: islands plus every built district's solids (follows streaming and rebuilds). */
  readonly collider: CompositeCollider;
  /** Districts still to build near the camera (0 once the surroundings are complete). */
  readonly streaming: { readonly pending: number };
  /** Shows a fresh course: locks, gates and completion; rebuilds the islands when sections or activities came or went. */
  apply(world: WorldData): void;
  /** Adds a listener for structural rebuilds; returns its remover. */
  onRebuild(listener: RebuildListener): () => void;
  /** Hands the camera from the overview to the caller. */
  stopOverview(): void;
  /** Adds a per-frame step that runs before the render; returns its remover. */
  onFrame(step: (dt: number) => void): () => void;
  /** A burst of gold sparkles at a point (pick-ups, completions). */
  sparkle(x: number, y: number, z: number): void;
}

let pickedTier: QualityTier | null = null;

/** The tier this page runs at: `?quality=` wins, else picked once from the device and its GPU. */
export function bootTier(): QualityTier {
  if (!pickedTier) {
    const params = new URLSearchParams(location.search);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    pickedTier = pickTier({ query: params.get('quality'), stored: storedTier(), memoryGb: memory, cores: navigator.hardwareConcurrency || 4, coarse, gpu: gpuName(), ua: navigator.userAgent });
  }
  return pickedTier;
}

const TIER_KEY = 'mooblox-tier';

/** The tier an earlier visit stepped down to, if any. */
function storedTier(): string | null {
  try {
    return localStorage.getItem(TIER_KEY);
  } catch {
    return null;
  }
}

/** Remembers a step-down for the next visit (ignored when storage is blocked). */
function rememberTier(tier: QualityTier): void {
  try {
    localStorage.setItem(TIER_KEY, tier);
  } catch {
    // Private mode or blocked storage: the step-down lasts this visit only.
  }
}

/** Builds the island scene for one course inside `root` (dressed with `models`) and starts the render loop. */
export function startWorld(root: HTMLElement, world: WorldData, models: ModelLibrary, gateStrings?: GateStrings): WorldView {
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'hidden', touchAction: 'none' });
  const params = new URLSearchParams(location.search);
  const tier = bootTier();
  const settings = QUALITY[tier];
  const kit = new MaterialKit(settings.materials);
  const look = CAMPUS;
  const stage = new Stage(root, kit, { antialias: settings.antialias, shadowMapSize: settings.shadowMapSize, post: settings.post, ao: settings.ao }, look);
  const registry = createPropRegistry();
  const signs = new CanvasSignPainter(() => gate.invalidate());
  const policy = new IslandLayout(look.size);
  const level = { minor: tier !== 'low', rich: tier === 'xhigh', detailShadows: tier === 'high' || tier === 'xhigh', minorDistance: MINOR_DISTANCE[tier] };
  const collider = new CompositeCollider();
  const dress = (w: WorldData, l: WorldLayout) => {
    const group = new IslandBuilder(kit, look, tier === 'low', RIM_DETAIL[tier]).build(w, l);
    const purposes = new Map(w.sections.flatMap((sec) => sec.activities).map((act) => [act.id, act.purpose]));
    const d = designWorld(l, w.courseId, look.palette, (id) => purposes.get(id));
    const scenery = new Group();
    scenery.name = 'scenery';
    const builds = d.districts.map((district) => new DistrictBuild(district, models, kit.scenery, DETAIL_DISTANCE[tier], level, (g) => new BvhCollider(g)));
    for (const b of builds) scenery.add(b.group);
    const glow = buildGlow(d, kit.glow);
    if (glow) scenery.add(glow);
    group.add(scenery);
    const material = (group.getObjectByName('water') as Mesh).material as ShaderMaterial;
    const water = material.isShaderMaterial ? material : null;
    const ground = group.children.filter((o) => o.name === 'land' || o.name === 'tops');
    const islandsPart = part(BvhCollider.fromMeshes(ground), ground);
    const units = builds.map((b) => ({
      x: b.district.island.x,
      z: b.district.island.z,
      // Bridges and docks reach past the island rim: stream by the whole district, not the island circle.
      radius: b.district.island.radius,
      get isBuilt() {
        return b.isBuilt;
      },
      step: () => b.step(),
      finish: () => b.finish(),
      unload: () => b.unload(),
    }));
    const streamer = new DistrictStreamer(units, STREAM[tier]);
    const solids = (): void => {
      const parts: ColliderPart[] = [islandsPart];
      for (const b of builds) {
        if (b.isBuilt && b.collider) parts.push({ collider: b.collider, bounds: b.bounds });
      }
      collider.set(parts);
    };
    return { group, dressing: d, water, districts: builds.map((b) => b.group), builds, streamer, solids };
  };
  let current = world;
  let layout = policy.layout(world);
  let built = dress(world, layout);
  built.streamer.buildNear(layout.spawn.x, layout.spawn.z, FIRST_PLAYABLE);
  built.solids();
  let islands = built.group;
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

  const quality = new QualityManager(stage, tier, params.has('quality') ? null : rememberTier);
  const overlay = params.get('perf') === '1' ? new PerfOverlay(root, stage.renderer, quality) : null;
  const steps = new Set<(dt: number) => void>();
  let clock = 0;
  const lod = PROP_LOD[tier];
  const sparkles = new Dust(0xffd65a, 2.4, 0.6);
  stage.add(sparkles.mesh);
  steps.add((dt) => {
    clock += dt;
    sparkles.update(dt);
    const eye = stage.camera.position;
    props.cull(eye.x, eye.z, lod.near, lod.far, PROPS_ALWAYS);
    if (built.streamer.pump(eye.x, eye.z, overview)) {
      built.solids();
      gate.invalidate();
    }
    cullDistricts(built.districts, eye.x, eye.z, settings.districtDistance, overview, settings.sceneryTris);
    kit.time.value = clock;
    if (built.water) built.water.uniforms['uTime']!.value = clock;
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
      frameOverview(stage, layout);
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
    for (const b of built.builds) b.unload();
    islands.traverse((o) => (o as Mesh).geometry?.dispose());
    props.group.removeFromParent();
    for (const prop of props.all) {
      prop.dispose();
    }
    layout = policy.layout(next);
    e = layout.extent;
    built = dress(next, layout);
    const p = stage.camera.position;
    built.streamer.buildNear(p.x, p.z, FIRST_PLAYABLE);
    built.solids();
    islands = built.group;
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
    get dressing() {
      return built.dressing;
    },
    collider,
    get streaming() {
      return built.streamer;
    },
    apply: (next) => {
      current = next;
      fence.setClosed(closedSections(next));
      const nextKey = structureKey(next);
      if (nextKey !== key) {
        key = nextKey;
        rebuild(next);
      } else {
        for (const p of props.update(next)) sparkles.kick(p.root.position.x, p.root.position.y + 1.2, p.root.position.z, 18, 1);
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
    sparkle: (x, y, z) => {
      sparkles.kick(x, y, z, 18, 1);
      gate.invalidate();
    },
  };
}

/** Prop LOD distances (from the camera, metres) per tier, and the course size up to which every prop always shows. */
const PROP_LOD = { low: { near: 20, far: 50 }, medium: { near: 30, far: 70 }, high: { near: 50, far: 140 }, xhigh: { near: 70, far: 200 } } as const;
const PROPS_ALWAYS = 40;
/** Island rim segments per metre of radius per tier. */
const RIM_DETAIL = { low: 1.5, medium: 2.5, high: 4, xhigh: 4 } as const;

/** Districts within this edge distance of the spawn are built before the first frame; the rest stream in. */
const FIRST_PLAYABLE = 25;
/** Per tier: build within `keep` m of the camera (edge), free past `drop`, at most `sliceMs` of building per frame. */
const STREAM = {
  low: { sliceMs: 4, keep: 70, drop: 100 },
  medium: { sliceMs: 6, keep: 125, drop: 150 },
  high: { sliceMs: 6, keep: 280, drop: 320 },
  xhigh: { sliceMs: 8, keep: Infinity, drop: Infinity },
} as const;

/** A collider part covering `meshes`' world box. */
function part(collider: BvhCollider, meshes: readonly Object3D[]): ColliderPart {
  const bounds = new Box3();
  for (const m of meshes) bounds.expandByObject(m);
  return { collider, bounds };
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
  const collider = new FencedCollider(view.collider, view.fence);
  const camera = new FollowCamera(view.stage.camera, view.stage.renderer.domElement, view.collider);
  const spawn = new Vector3(view.layout.spawn.x, SPAWN_HEIGHT, view.layout.spawn.z);
  view.stopOverview();
  const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const touch = new TouchControls(view.stage.canvasHost, coarse || new URLSearchParams(location.search).has('touch'));
  const player = new Player(avatar, collider, spawn, new CombinedInput([new KeyboardInput(), touch, ...inputs]), camera);
  const focus = view.dressing.focus;
  // The first view frames the hub landmark down its avenue.
  if (focus) player.teleport(spawn.x, spawn.z, Math.atan2(focus.x - spawn.x, focus.z - spawn.z));
  view.onRebuild((before, after) => {
    const p = player.body.position;
    const shift = shiftFor(before, after, p.x, p.z);
    player.shift(shift.x, shift.z);
  });
  // Footstep dust is an effect: off on the low tier.
  const dust = view.quality.tier === 'low' ? null : new Dust();
  if (dust) {
    view.stage.add(dust.mesh);
    player.onFeet = (x, y, z, n, strength) => dust.kick(x, y, z, n, strength);
  }
  view.onFrame((dt) => {
    player.update(dt);
    dust?.update(dt);
    view.stage.focusShadow(player.body.position.x, player.body.position.z, SHADOW_RADIUS);
  });
  return player;
}

/** The course the world shows and the gateway that changes it. */
export interface Course {
  readonly store: CourseStore;
  readonly gateway: MoodleGateway;
}

/** The activity interaction plus the course book it shares the panel with. */
export type Activities = ActivityInteraction & { readonly book: BookController };

/** Prompts at each plot, opens activities in the panel, re-reads the course after each close. */
export function startActivities(view: WorldView, player: Player, openers: OpenerRegistry, course: Course): Activities {
  const host = view.stage.canvasHost;
  const panel = new Panel(host);
  const prompt = new ActivityPrompt(host, () => void interaction.openCurrent());
  let plotsOf: WorldLayout | null = null;
  let allPlots: readonly Plot[] = [];
  const plots = () => {
    if (plotsOf !== view.layout) {
      plotsOf = view.layout;
      allPlots = plotsOf.zones.flatMap((z) => z.plots);
    }
    return allPlots;
  };
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
  view.onFrame((dt) => {
    interaction.update(player.body.position.x, player.body.position.z);
    view.props.swing(interaction.nearId, dt);
  });
  const book = new BookController(host, panel, view.gate, () => course.store.world ?? view.world, (id) => goToPlot(view, player, id));
  return Object.assign(interaction, { book });
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
  const shadow = view.quality.tier === 'high' || view.quality.tier === 'xhigh';
  avatar.root.traverse((o) => (o.castShadow = shadow));
  view.stage.add(avatar.root);
  const guide = new Guide(avatar, view.stage.camera, view.stage.canvasHost, strings, (id) => goToPlot(view, player, id));
  guide.say(tutor.greet({ world: course.store.world ?? view.world }));
  course.store.subscribe((world) => guide.say(tutor.nextStep({ world })));
  view.onFrame((dt) => guide.update(dt, player.avatar.root.position));
  return guide;
}

/** The character creator: the world pauses behind it; Save swaps the player's model and keeps the look through `keep`. */
export function startAvatarPicker(
  view: WorldView,
  player: Player,
  avatars: AvatarFactory,
  look: AvatarLook,
  keep: (look: AvatarLook) => Promise<void>,
  strings: AvatarPickerStrings,
): AvatarPicker {
  let latest = 0;
  return new AvatarPicker(view.stage.canvasHost, avatars, look, strings, {
    opened: () => view.gate.pause(),
    closed: () => {
      player.faceCamera();
      view.gate.resume();
    },
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

/** Overview camera that keeps every island in view, centred on their bounding box, pulling back on portrait screens. */
function frameOverview(stage: Stage, layout: WorldLayout): void {
  const all = [...layout.hubs, ...layout.zones];
  const minX = Math.min(...all.map((c) => c.x - c.radius));
  const maxX = Math.max(...all.map((c) => c.x + c.radius));
  const minZ = Math.min(...all.map((c) => c.z - c.radius));
  const maxZ = Math.max(...all.map((c) => c.z + c.radius));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const extent = Math.max(maxX - minX, maxZ - minZ) / 2;
  const pull = Math.pow(Math.max(1, 1.4 / stage.camera.aspect), 0.6);
  stage.camera.position.set(cx - extent * 0.45 * pull, extent * 0.8 * Math.pow(pull, 2), cz + extent * 1.35 * Math.pow(pull, 0.8));
  stage.camera.lookAt(cx, -2, cz + extent * 0.12);
  const fog = stage.scene.fog;
  if (fog instanceof Fog) {
    const d = stage.camera.position.distanceTo(new Vector3(cx, 0, cz));
    fog.near = Math.max(fog.near, d * 0.8);
    fog.far = Math.max(fog.far, d * 2);
  }
}
