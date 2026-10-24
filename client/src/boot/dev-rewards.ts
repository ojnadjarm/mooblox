import fixture from '../../test/fixtures/get_world_demo.json';
import rewardsFixture from '../../test/fixtures/get_rewards_demo.json';
import type { WorldDto } from '../domain/dto';
import type { Rewards } from '../domain/rewards';
import type { RewardsDto } from '../domain/rewards-dto';
import { isDone } from '../domain/types';
import { createOpenerRegistry } from '../interaction/catalog';
import { FakeGateway } from '../moodle/fake-gateway';
import { AvatarKit, type AvatarLook } from '../player/avatar-kit';
import { encodeLook } from '../player/look';
import { Palette } from '../world/palette';
import { CourseStore } from '../state/course-store';
import { DEFAULT_AVATAR_PICKER_STRINGS } from '../ui/avatar-picker';
import { modelIds } from '../world/dressing';
import { ModelLibrary } from '../world/model-library';
import { bootTier, startActivities, startAvatarPicker, startPlayer, startWorld } from './app';
import { startRewards } from './rewards';

const ASSETS = '/assets/';
const FIXTURE_HOST = 'https://moodle.example';
const XP_PER_COMPLETION = 10;
const LEVEL_REWARD = 'hat-explorer';

/** Fake Moodle whose XP grows by 10 per newly completed activity, levelling on the server curve 25·n·(n+1). */
class DevRewardsGateway extends FakeGateway {
  private baseline: number | null = null;

  constructor(
    world: WorldDto,
    rewards: RewardsDto,
    private readonly startXp: number,
  ) {
    super(world, rewards);
  }

  override async getRewards(courseId: number): Promise<Rewards> {
    const r = await super.getRewards(courseId);
    const done = (await this.getWorld(courseId)).sections.flatMap((s) => s.activities).filter((a) => isDone(a.completion)).length;
    this.baseline ??= done;
    const xp = this.startXp + (done - this.baseline) * XP_PER_COMPLETION;
    const level = levelOf(xp);
    const peak = Math.max(level, r.peakLevel);
    const unlocks = peak > r.peakLevel && !r.unlocks.includes(LEVEL_REWARD) ? [...r.unlocks, LEVEL_REWARD] : r.unlocks;
    return { ...r, xp, level, peakLevel: peak, levelStart: 25 * level * (level + 1), levelNext: 25 * (level + 1) * (level + 2), unlocks };
  }
}

const levelOf = (xp: number): number => Math.floor((Math.sqrt(1 + (4 * xp) / 25) - 1) / 2);

/** Dev page for the rewards UI: the demo course and the captured rewards, no Moodle needed. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root')!;
  const params = new URLSearchParams(location.search);
  const dto = JSON.parse(JSON.stringify(fixture).replaceAll(FIXTURE_HOST, location.origin)) as WorldDto;
  const rewards = structuredClone(rewardsFixture) as RewardsDto;
  rewards.enabled = !params.has('off');
  const gateway = new DevRewardsGateway(dto, rewards, Number(params.get('xp') ?? rewards.xp));
  const store = new CourseStore();
  store.set(await gateway.getWorld(fixture.courseid));
  const models = await ModelLibrary.load(ASSETS, modelIds(), bootTier() === 'xhigh');
  const view = startWorld(root, store.world!, models);
  const avatars = await AvatarKit.load(ASSETS);
  const look: AvatarLook = { skin: 'b', tint: Palette.red };
  const player = await startPlayer(view, avatars, look);
  const interaction = startActivities(view, player, createOpenerRegistry(gateway), { store, gateway });
  const keep = (l: AvatarLook) => gateway.savePreference('local_mooblox_avatar', encodeLook(l));
  const picker = startAvatarPicker(view, player, avatars, look, keep, DEFAULT_AVATAR_PICKER_STRINGS);
  const weeks = params.has('weeks') ? Number(params.get('weeks')) : null;
  const rewardsUi = await startRewards(view, interaction, { gateway, courseId: fixture.courseid, strings: {}, weeks: () => weeks });
  const probe: Record<string, unknown> = { ready: true };
  Object.assign(window, { mooblox: { ...view, view, probe, player, interaction, store, gateway, picker, rewards: rewardsUi } });
}

boot().catch((e: unknown) => console.error('mooblox: rewards dev boot failed', e));
