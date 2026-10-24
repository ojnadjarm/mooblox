import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { FakeGateway } from '../../src/moodle/fake-gateway';
import { CourseStore } from '../../src/state/course-store';
import { CourseSync } from '../../src/state/course-sync';

describe('CourseSync', () => {
  it('pushes a changed completion into the store once, and reports failures', async () => {
    const gateway = new FakeGateway(fixture);
    const store = new CourseStore();
    store.set(await gateway.getWorld(30));
    const listener = vi.fn();
    store.subscribe(listener);
    const sync = new CourseSync(gateway, store, 30);
    expect(await sync.refresh()).toBe(false);
    await gateway.viewActivity(41);
    expect(await sync.refresh()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.world!.sections[1]!.activities[0]!.completion.state).toBe(1);
    const onError = vi.fn();
    expect(await new CourseSync(gateway, store, 999, onError).refresh()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
