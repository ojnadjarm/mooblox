import fixture from '../../test/fixtures/get_world_demo.json';
import { FakeGateway } from '../moodle/fake-gateway';
import { AvatarKit, type AvatarLook } from '../player/avatar-kit';
import type { AvatarState } from '../player/clips';
import { Palette } from '../world/palette';
import { startWorld, type WorldView } from './app';

const ASSETS = '/assets/';

/** Dev composition root: the demo course from the captured fixture, no Moodle needed. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root')!;
  const gateway = new FakeGateway(fixture);
  const view = startWorld(root, await gateway.getWorld(fixture.courseid));
  const probe: Record<string, unknown> = {};
  Object.assign(window, { mooblox: { ...view, probe } });
  if (new URLSearchParams(location.search).get('scene') === 'avatars') {
    await avatarLineup(view, probe);
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
  probe['ready'] = true;
  view.stage.camera.position.set(-1.2, 2.6, 6.4);
  view.stage.camera.lookAt(0, 1.5, -1);
  view.stage.focusShadow(0, -1, 12);
}

boot().catch((e: unknown) => console.error('mooblox: dev boot failed', e));
