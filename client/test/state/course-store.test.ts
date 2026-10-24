import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { FakeGateway } from '../../src/moodle/fake-gateway';
import { CourseStore } from '../../src/state/course-store';

describe('CourseStore', () => {
  it('notifies subscribers once per change and not for an equal world', async () => {
    const gw = new FakeGateway(fixture);
    const store = new CourseStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.set(await gw.getWorld(30));
    store.set(await gw.getWorld(30));
    expect(a).toHaveBeenCalledTimes(1);

    await gw.viewActivity(42);
    expect(store.set(await gw.getWorld(30))).toBe(true);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    expect(a).toHaveBeenLastCalledWith(store.world);
  });

  it('stops notifying after unsubscribe', async () => {
    const store = new CourseStore();
    const a = vi.fn();
    store.subscribe(a)();
    store.set(await new FakeGateway(fixture).getWorld(30));
    expect(a).not.toHaveBeenCalled();
  });
});
