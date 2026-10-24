import fixture from '../../test/fixtures/get_world_demo.json';
import { FakeGateway } from '../moodle/fake-gateway';
import { startWorld } from './app';

/** Dev composition root: the demo course from the captured fixture, no Moodle needed. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root')!;
  const gateway = new FakeGateway(fixture);
  const view = startWorld(root, await gateway.getWorld(fixture.courseid));
  (window as unknown as { mooblox: unknown }).mooblox = view;
}

boot().catch((e: unknown) => console.error('mooblox: dev boot failed', e));
