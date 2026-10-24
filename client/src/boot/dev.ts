import fixture from '../../test/fixtures/get_world_demo.json';
import type { WorldDto } from '../domain/dto';
import { CompletionTracking } from '../domain/types';
import { FakeGateway } from '../moodle/fake-gateway';
import { CourseStore } from '../state/course-store';
import { AvatarKit, type AvatarLook } from '../player/avatar-kit';
import type { AvatarState } from '../player/clips';
import { NO_INPUT, type InputSource, type InputState } from '../player/input';
import type { Player } from '../player/player';
import { Palette } from '../world/palette';
import { createPropRegistry } from '../world/props/catalog';
import { CanvasSignPainter } from '../world/props/sign-painter';
import { createOpenerRegistry } from '../interaction/catalog';
import { startActivities, startPlayer, startWorld, type WorldView } from './app';

const ASSETS = '/assets/';
const FIXTURE_HOST = 'https://moodle.example';

/** Dev composition root: the demo course from the captured fixture, no Moodle needed. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root')!;
  const params = new URLSearchParams(location.search);
  const dto = JSON.parse(JSON.stringify(fixture).replaceAll(FIXTURE_HOST, location.origin)) as WorldDto;
  const manual = Number(params.get('manual') ?? 0);
  for (const m of dto.sections.flatMap((s) => s.modules).filter((x) => x.id === manual)) {
    Object.assign(m, { completion: CompletionTracking.Manual, isautomatic: false });
  }
  const gateway = new FakeGateway(dto);
  const store = new CourseStore();
  store.set(await gateway.getWorld(fixture.courseid));
  const view = startWorld(root, store.world!);
  const probe: Record<string, unknown> = {};
  Object.assign(window, { mooblox: { ...view, probe } });
  const scene = params.get('scene');
  if (scene === 'avatars') {
    await avatarLineup(view, probe);
  } else if (scene === 'props') {
    propLineup(view, probe);
  } else if (scene !== 'overview') {
    const walk = Number(params.get('walk') ?? 0);
    const pilot = new Autopilot();
    const player = await startPlayer(view, ASSETS, { skin: 'b', tint: Palette.red }, [pilot]);
    const interaction = startActivities(view, player, createOpenerRegistry(gateway), { store, gateway });
    Object.assign(window, { mooblox: { ...view, probe, player, interaction, store, gateway } });
    if (walk) {
      pilot.drive(view, player, walk, probe);
    }
  }
  probe['ready'] = true;
}

/** Scripted input that walks the player over the bridge to an activity's plot. */
class Autopilot implements InputSource {
  private state: InputState = NO_INPUT;

  read(): InputState {
    return this.state;
  }

  drive(view: WorldView, player: Player, cmid: number, probe: Record<string, unknown>): void {
    const zone = view.layout.zones.find((z) => z.plots.some((p) => p.activityId === cmid));
    const plot = zone?.plots.find((p) => p.activityId === cmid);
    if (!zone || !plot) {
      throw new Error(`no plot for cm ${cmid}`);
    }
    const waypoints = [
      { x: zone.x, z: zone.z, r: 1.5 },
      { x: plot.x, z: plot.z, r: plot.radius - 1 },
    ];
    probe['target'] = { x: plot.x, z: plot.z, radius: plot.radius };
    probe['reached'] = false;
    const start = performance.now();
    view.onFrame(() => {
      const p = player.body.position;
      const w = waypoints[0];
      probe['position'] = { x: p.x, y: p.y, z: p.z };
      if (!w) {
        this.state = NO_INPUT;
        return;
      }
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const d = Math.hypot(dx, dz);
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
