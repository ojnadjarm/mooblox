import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { isDone } from '../../src/domain/types';
import { FakeGateway } from '../../src/moodle/fake-gateway';

describe('FakeGateway', () => {
  it('serves the fixture and marks a viewed automatic activity complete', async () => {
    const gw = new FakeGateway(fixture);
    const page = (await gw.getWorld(30)).sections[1]?.activities[0];
    expect(page && isDone(page.completion)).toBe(false);
    await gw.viewActivity(41);
    const after = (await gw.getWorld(30)).sections[1]?.activities[0];
    expect(after && isDone(after.completion)).toBe(true);
    expect(fixture.sections[1]?.modules[0]?.state).toBe(0);
  });

  it('rejects an unknown course', async () => {
    await expect(new FakeGateway(fixture).getWorld(1)).rejects.toThrow();
  });
});
