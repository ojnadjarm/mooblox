import fixture from '../../test/fixtures/get_world_demo.json';
import type { WorldDto } from '../domain/dto';
import type { Circle, Plot } from '../world/layout';
import { CompletionTracking } from '../domain/types';
import { FakeGateway } from '../moodle/fake-gateway';
import { CourseStore } from '../state/course-store';
import { AvatarKit, type AvatarLook } from '../player/avatar-kit';
import type { AvatarState } from '../player/clips';
import { NO_INPUT, type InputSource, type InputState } from '../player/input';
import type { Player } from '../player/player';
import { parseShape, shapeWorld } from '../domain/course-shape';
import { modelIds } from '../world/dressing';
import { startLife } from '../world/life';
import { ModelLibrary } from '../world/model-library';
import { WalkGrid } from '../world/walk-grid';
import { tourGoals, walkPath, type GroundPoint } from '../world/walk-tour';
import { Palette } from '../world/palette';
import { createPropRegistry } from '../world/props/catalog';
import { CanvasSignPainter } from '../world/props/sign-painter';
import { createOpenerRegistry } from '../interaction/catalog';
import { decodeLook, encodeLook } from '../player/look';
import { DEFAULT_AVATAR_PICKER_STRINGS } from '../ui/avatar-picker';
import { DEFAULT_GUIDE_STRINGS } from '../tutor/guide';
import { ScriptedTutor } from '../tutor/scripted-tutor';
import { preloadAssets } from './asset-preload';
import { BOOT_MODELS } from './boot-assets';
import { liveHandle } from './live-handle';
import { startSound } from './sound';
import { conceptShot } from './dev-shots';
import { WhiteOut } from '../ui/white-out';
import { startArrival } from './arrival';
import { startReturnPortal } from './return-portal';
import { bootTier, startActivities, startAvatarPicker, startGuide, startPlayer, startWorld, type WorldView } from './app';

const ASSETS = '/assets/';
const FIXTURE_HOST = 'https://moodle.example';

/** Dev composition root: the demo course from the captured fixture, no Moodle needed. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root')!;
  const preloaded = preloadAssets(ASSETS, BOOT_MODELS);
  const params = new URLSearchParams(location.search);
  const dto = JSON.parse(JSON.stringify(fixture).replaceAll(FIXTURE_HOST, location.origin)) as WorldDto;
  const manual = Number(params.get('manual') ?? 0);
  for (const m of dto.sections.flatMap((s) => s.modules).filter((x) => x.id === manual)) {
    Object.assign(m, { completion: CompletionTracking.Manual, isautomatic: false });
  }
  const modules = dto.sections.flatMap((s) => s.modules);
  for (const m of modules.filter((x) => x.id === Number(params.get('locked')))) {
    Object.assign(m, { available: false, availableinfo: 'Not available unless: The activity <strong>Moodle logo video</strong> is marked complete' });
  }
  for (const m of modules.filter((x) => x.id === Number(params.get('due')))) {
    m.dates = [{ label: 'Opened:', timestamp: 1792828800 }, { label: 'Closes:', timestamp: 1793433600 }];
  }
  const gateway = new FakeGateway(dto);
  const store = new CourseStore();
  const shape = params.get('shape');
  store.set(shape ? shapeWorld(Number(params.get('course') ?? 7), parseShape(shape)) : await gateway.getWorld(fixture.courseid));
  const xhigh = bootTier() === 'xhigh';
  await preloaded;
  const models = await ModelLibrary.load(ASSETS, modelIds());
  const view = startWorld(root, store.world!, models);
  if (xhigh) void view.kit.loadDetail(ASSETS);
  const avatars = await AvatarKit.load(ASSETS);
  await startLife(view, models, view.quality.tier === 'low' || params.has('nokids') ? null : avatars);
  const probe: Record<string, unknown> = {};
  Object.assign(window, { mooblox: { ...view, probe } });
  const scene = params.get('scene');
  if (scene === 'avatars') {
    await avatarLineup(view, probe);
  } else if (scene === 'props') {
    propLineup(view, probe);
  } else if (scene === 'shot') {
    const name = params.get('cam');
    const shot = conceptShot(name === 'district' || name === 'shore' || name === 'cliff' ? name : 'hub', view.layout, view.dressing);
    view.stopOverview();
    // The island looked at is the live one (the camera itself may hover over the water).
    view.follow({ x: shot.at.x, z: shot.at.z });
    view.stage.camera.position.set(shot.eye.x, shot.eye.y, shot.eye.z);
    view.stage.camera.lookAt(shot.at.x, shot.at.y, shot.at.z);
    if (shot.shift) view.stage.camera.setViewOffset(1000, 1000, 0, shot.shift * 1000, 1000, 1000);
    view.stage.focusShadow(shot.at.x, shot.at.z, 40);
  } else if (scene !== 'overview') {
    const tour = params.get('walk') === 'tour';
    const walk = tour ? 0 : params.get('walk') === 'far' ? farthestPlot(view) : Number(params.get('walk') ?? 0);
    const pilot = new Autopilot();
    const look = params.has('avatar') ? decodeLook(params.get('avatar')!, avatars.bodies.map((b) => b.id)) : { skin: 'b', tint: Palette.red };
    const player = await startPlayer(view, avatars, look, [pilot]);
    const course = { store, gateway };
    const interaction = startActivities(view, player, createOpenerRegistry(gateway), course);
    const guide = await startGuide(view, player, avatars, new ScriptedTutor(), course, DEFAULT_GUIDE_STRINGS);
    const keep = (l: typeof look) => gateway.savePreference('local_mooblox_avatar', encodeLook(l));
    const picker = startAvatarPicker(view, player, avatars, look, keep, DEFAULT_AVATAR_PICKER_STRINGS);
    const sound = startSound(view, player, { assets: ASSETS, stored: params.get('sound') ?? '', gateway, strings: {}, store, rewards: null, bubble: guide.bubble });
    const whiteOut = new WhiteOut(root);
    const portal = startReturnPortal(view, player, { huburl: 'hub.html', navigate: () => undefined, whiteOut, engine: () => sound.engine });
    const warped = params.has('warp');
    if (warped) history.replaceState(history.state, '', location.href.replace(/[?&]warp=1/, '').replace(/\.html&/, '.html?'));
    const arrival = warped ? startArrival(view, player, whiteOut, sound.arrive) : null;
    Object.assign(window, { mooblox: liveHandle(view, { probe, player, interaction, store, gateway, guide, picker, sound, portal, arrival }) });
    if (tour) {
      const grid = new WalkGrid(view.layout, view.dressing);
      const stops = tourGoals(view.layout, grid, view.dressing.start);
      const legs = walkPath(grid, view.dressing.start, stops).map((p) => ({ x: p.x, z: p.z, r: 1.5 }));
      const end = stops.at(-1)!;
      legs[legs.length - 1] = { x: end.x, z: end.z, r: end.radius - 1 };
      probe['tour'] = stops.map((s) => s.activityId);
      pilot.drive(view, player, legs, end, probe);
    } else if (walk) {
      pilot.drive(view, player, plotWalk(view, walk), plotOf(view, walk), probe);
    }
  }
  probe['ready'] = true;
}

/** The activity whose plot lies farthest from the spawn (the longest autopilot walk). */
function farthestPlot(view: WorldView): number {
  const s = view.layout.spawn;
  const plots = view.layout.zones.flatMap((z) => z.plots);
  return plots.reduce((a, b) => (Math.hypot(b.x - s.x, b.z - s.z) > Math.hypot(a.x - s.x, a.z - s.z) ? b : a)).activityId;
}

/** The plot of an activity. */
function plotOf(view: WorldView, cmid: number): Plot {
  const plot = view.layout.zones.flatMap((z) => z.plots).find((p) => p.activityId === cmid);
  if (!plot) {
    throw new Error(`no plot for cm ${cmid}`);
  }
  return plot;
}

/** Waypoints over the bridge to an activity's plot: its district's rim, the district centre, the plot. */
function plotWalk(view: WorldView, cmid: number): Waypoint[] {
  const plot = plotOf(view, cmid);
  const zone = view.layout.zones.find((z) => z.plots.includes(plot))!;
  const a = zone.anchor;
  const d = Math.hypot(zone.x - a.x, zone.z - a.z);
  return [
    { x: a.x + ((zone.x - a.x) / d) * (a.radius - 2), z: a.z + ((zone.z - a.z) / d) * (a.radius - 2), r: 1.5 },
    { x: zone.x, z: zone.z, r: 1.5 },
    { x: plot.x, z: plot.z, r: plot.radius - 1 },
  ];
}

type Waypoint = GroundPoint & { readonly r: number };

/** Scripted input that runs the player through waypoints to a plot. */
class Autopilot implements InputSource {
  private state: InputState = NO_INPUT;

  read(): InputState {
    return this.state;
  }

  drive(view: WorldView, player: Player, route: readonly Waypoint[], plot: Circle, probe: Record<string, unknown>): void {
    const waypoints = [...route];
    probe['target'] = { x: plot.x, z: plot.z, radius: plot.radius };
    probe['reached'] = false;
    const start = performance.now();
    // Unstick: no 0.5 m of progress in 0.75 s (a solid the walk grid does not know) sidesteps for 0.5 s, alternating sides.
    const mark = { x: 0, z: 0, t: start, side: 1, until: 0 };
    view.onFrame(() => {
      const p = player.body.position;
      const w = waypoints[0];
      probe['position'] = { x: p.x, y: p.y, z: p.z };
      if (!w) {
        this.state = NO_INPUT;
        return;
      }
      const now = performance.now();
      if (Math.hypot(p.x - mark.x, p.z - mark.z) > 0.5) Object.assign(mark, { x: p.x, z: p.z, t: now });
      else if (now - mark.t > 750 && now > mark.until) Object.assign(mark, { t: now, side: -mark.side, until: now + 500 });
      const side = now < mark.until ? mark.side : 0;
      const ax = w.x - p.x;
      const az = w.z - p.z;
      const dx = side ? -az * side : ax;
      const dz = side ? ax * side : az;
      const d = Math.hypot(ax, az);
      if (d < w.r) {
        waypoints.shift();
        if (waypoints.length === 0) {
          probe['reached'] = true;
          probe['seconds'] = (performance.now() - start) / 1000;
        }
        return;
      }
      const yaw = player.camera.yaw;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      this.state = { x: (dx * c - dz * s) / d, z: (-dx * s - dz * c) / d, run: true, jump: false };
    });
  }
}

/** Three tinted avatars on the plaza, each in another state, framed close. */
async function avatarLineup(view: WorldView, probe: Record<string, unknown>): Promise<void> {
  const kit = await AvatarKit.load(ASSETS);
  const lineup: [AvatarLook, AvatarState, number][] = [
    [{ skin: 'b', tint: Palette.red }, 'idle', -2.6],
    [{ skin: 'e', tint: Palette.blue }, 'walk', 0],
    [{ skin: 'k', tint: Palette.yellow }, 'jump', 2.6],
  ];
  const clips: unknown[] = [];
  for (const [look, state, x] of lineup) {
    const avatar = await kit.create(look);
    avatar.root.position.set(x, state === 'jump' ? 0.9 : 0.3, -1);
    avatar.root.rotation.y = x * 0.1;
    avatar.play(state);
    view.stage.add(avatar.root);
    view.onFrame((dt) => avatar.update(dt));
    clips.push(avatar.clipNames);
  }
  probe['clips'] = clips;
  view.stopOverview();
  view.stage.camera.position.set(-1.2, 2.6, 6.4);
  view.stage.camera.lookAt(0, 1.5, -1);
  view.stage.focusShadow(0, -1, 12);
}

/** The book stand, cinema and arena gate side by side on the plaza, plus a locked door. */
function propLineup(view: WorldView, probe: Record<string, unknown>): void {
  const registry = createPropRegistry();
  const all = view.world.sections.flatMap((s) => s.activities);
  const picks = [41, 42, 44].map((id) => all.find((a) => a.id === id)!);
  picks.push({ ...picks[0]!, id: 99, modname: 'assign', name: 'Locked door', purpose: 'assessment', available: false });
  const ctx = { kit: view.kit, signs: new CanvasSignPainter(() => view.gate.invalidate()) };
  probe['props'] = picks.map((a, i) => {
    const factory = registry.resolve(a);
    const prop = factory.create(a, { x: (i - 1.5) * 4.2, z: -2.2, radius: 2.5, facing: 0, activityId: a.id, sectionId: a.sectionId }, ctx);
    prop.root.position.y = 0.02;
    view.stage.add(prop.root);
    return `${a.modname}:${factory.key}:${prop.state.locked ? 'locked' : 'open'}`;
  });
  view.stopOverview();
  view.stage.camera.position.set(0, 3.6, 6.8);
  view.stage.camera.lookAt(0, 2.2, -2);
  view.stage.focusShadow(0, -2, 14);
}

boot().catch((e: unknown) => console.error('mooblox: dev boot failed', e));
