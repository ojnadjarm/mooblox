import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import rewards from '../fixtures/get_rewards_demo.json';
import { assertRewardsDto } from '../../src/domain/rewards-mapper';
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

  it('serves rewards off without a rewards fixture', async () => {
    expect((await new FakeGateway(fixture).getRewards(30)).enabled).toBe(false);
  });

  it('claims unlocked collectibles idempotently and refuses locked keys and items', async () => {
    assertRewardsDto(rewards);
    const gw = new FakeGateway({ ...fixture, courseid: 31 }, rewards);
    expect(await gw.claimCollectible(31, 'gem:46')).toBe(1);
    expect(await gw.claimCollectible(31, 'gem:46')).toBe(1);
    expect((await gw.getRewards(31)).collectibles.find((c) => c.key === 'gem:46')?.found).toBe(true);
    await expect(gw.claimCollectible(31, 'gem:50')).rejects.toMatchObject({ errorcode: 'collectiblelocked' });
    const owned = rewards.unlocks[0]!;
    expect(await gw.setLook({ hat: null, outfit: owned, pet: null })).toEqual({ hat: null, outfit: owned, pet: null });
    expect((await gw.getRewards(31)).look.outfit).toBe(owned);
    await expect(gw.setLook({ hat: null, outfit: null, pet: 'pet-cat' })).rejects.toMatchObject({ errorcode: 'itemlocked' });
  });
});
