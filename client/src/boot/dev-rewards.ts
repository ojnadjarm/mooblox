import fixture from '../../test/fixtures/get_world_demo.json';
import rewardsFixture from '../../test/fixtures/get_rewards_demo.json';
import type { WorldDto } from '../domain/dto';
import type { Rewards } from '../domain/rewards';
import type { RewardsDto } from '../domain/rewards-dto';
import { isDone } from '../domain/types';
import { createOpenerRegistry } from '../interaction/catalog';
import { FakeGateway } from '../moodle/fake-gateway';
import { AvatarKit, type AvatarLook } from '../player/avatar-kit';
import { Outfitter } from '../player/attachments';
import { HatLibrary } from '../player/hats';
import { COSMETICS } from '../rewards/catalog';
import { encodeLook } from '../player/look';
import { Palette } from '../world/palette';
import { CourseStore } from '../state/course-store';
import { DEFAULT_AVATAR_PICKER_STRINGS } from '../ui/avatar-picker';
import { modelIds } from '../world/dressing';
import { ModelLibrary } from '../world/model-library';
import { preloadAssets } from './asset-preload';
import { BOOT_MODELS } from './boot-assets';
import { startActivities, startAvatarPicker, startPlayer, startWorld, type WorldView } from './app';
import { startRewards } from './rewards';
import { startSound } from './sound';
import { celebratedKey } from '../rewards/new-badges';

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
    private readonly allUnlocked: boolean,
    private readonly goal: readonly [number, number] | null = null,
  ) {
    super(world, { ...rewards, collectibles: devCollectibles(world) });
  }

  /** Unlocks gems of done activities and crystals of finished sections (all of them with `?collect=all`). */
  private async unlock(courseId: number): Promise<void> {
    const sections = (await this.getWorld(courseId)).sections;
    for (const c of this.rewards.collectibles) {
      const acts = sections.find((s) => s.id === c.sectionid)?.activities.filter((a) => a.completion.tracking !== 0) ?? [];
      const done = c.kind === 'gem' ? acts.some((a) => a.id === c.cmid && isDone(a.completion)) : acts.length > 0 && acts.every((a) => isDone(a.completion));
      c.unlocked = this.allUnlocked || done;
    }
  }

  override async claimCollectible(courseId: number, key: string): Promise<number> {
    await this.unlock(courseId);
    return super.claimCollectible(courseId, key);
  }

  override async getRewards(courseId: number): Promise<Rewards> {
    await this.unlock(courseId);
    const r = await super.getRewards(courseId);
    const done = (await this.getWorld(courseId)).sections.flatMap((s) => s.activities).filter((a) => isDone(a.completion)).length;
    this.baseline ??= done;
    const xp = this.startXp + (done - this.baseline) * XP_PER_COMPLETION;
    const level = levelOf(xp);
    const peak = Math.max(level, r.peakLevel);
    const unlocks = peak > r.peakLevel && !r.unlocks.includes(LEVEL_REWARD) ? [...r.unlocks, LEVEL_REWARD] : r.unlocks;
    const goal = this.goal && { week: 202643, target: this.goal[1], progress: Math.min(this.goal[1], this.goal[0] + done - this.baseline), reached: false, timeReached: 0 };
    if (goal) goal.reached = goal.progress >= goal.target;
    return { ...r, xp, level, peakLevel: peak, levelStart: 25 * level * (level + 1), levelNext: 25 * (level + 1) * (level + 2), unlocks, goal };
  }
}

/** The server's keys for the demo world: a gem per tracked activity, a crystal per section, a star where 2+ are tracked. */
function devCollectibles(world: WorldDto): RewardsDto['collectibles'] {
  return world.sections.flatMap((sec) => {
    const tracked = sec.modules.filter((m) => m.completion !== 0);
    if (!tracked.length) return [];
    const item = (key: string, kind: 'gem' | 'crystal' | 'star', cmid: number) => ({ key, kind, sectionid: sec.id, cmid, unlocked: false, found: false });
    return [
      ...tracked.map((m) => item(`gem:${m.id}`, 'gem', m.id)),
      item(`crystal:${sec.id}`, 'crystal', 0),
      ...(tracked.length >= 2 ? [item(`star:${sec.id}:0`, 'star', 0)] : []),
    ];
  });
}

const BADGE_NAMES = ['Bookworm', 'Quiz champ', 'Helper', 'Star reader', 'Explorer', 'Team player', 'Night owl', 'Speedy', 'Inventor', 'Artist', 'Scientist', 'Kind heart'];
const BADGE_COLOURS = ['#2fa39a', '#e0844f', '#a774f0', '#1e88e5', '#5db761', '#f6c445'];

/** `n` badges with drawn SVG images (data URIs: no server needed). */
function devTrophies(n: number): RewardsDto['trophies'] {
  return Array.from({ length: n }, (_, i) => {
    const c = BADGE_COLOURS[i % BADGE_COLOURS.length]!;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${c}"/><path d="M50 16l9 22 24 2-18 16 6 24-21-13-21 13 6-24-18-16 24-2z" fill="#fff"/><text x="50" y="62" font-size="22" font-family="sans-serif" font-weight="900" text-anchor="middle" fill="${c}">${i + 1}</text></svg>`;
    return { badgeid: i + 1, name: BADGE_NAMES[i % BADGE_NAMES.length]!, image: `data:image/svg+xml,${encodeURIComponent(svg)}`, timeissued: 1792847382 + i * 3600 };
  });
}

/** `?goal=3/6`: class goal progress and target (completions on the page add to it). */
function devGoal(value: string | null): [number, number] | null {
  const m = /^(\d+)\/(\d+)$/.exec(value ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const levelOf = (xp: number): number => Math.floor((Math.sqrt(1 + (4 * xp) / 25) - 1) / 2);

/** Dev page for the rewards UI: the demo course and the captured rewards, no Moodle needed. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root')!;
  const preloaded = preloadAssets(ASSETS, BOOT_MODELS);
  const params = new URLSearchParams(location.search);
  const dto = JSON.parse(JSON.stringify(fixture).replaceAll(FIXTURE_HOST, location.origin)) as WorldDto;
  const rewards = structuredClone(rewardsFixture) as RewardsDto;
  rewards.enabled = !params.has('off');
  if (params.has('hat')) {
    rewards.look.hat = params.get('hat')!;
    rewards.unlocks.push(rewards.look.hat);
  }
  if (params.has('pet')) {
    rewards.look.pet = params.get('pet')!;
    rewards.unlocks.push(rewards.look.pet);
  }
  if (params.has('trophies')) rewards.trophies = devTrophies(Number(params.get('trophies')));
  const gateway = new DevRewardsGateway(dto, rewards, Number(params.get('xp') ?? rewards.xp), params.get('collect') === 'all', devGoal(params.get('goal')));
  const store = new CourseStore();
  store.set(await gateway.getWorld(fixture.courseid));
  await preloaded;
  const models = await ModelLibrary.load(ASSETS, modelIds());
  const view = startWorld(root, store.world!, models);
  const avatars = await AvatarKit.load(ASSETS);
  if (params.get('scene') === 'hats') {
    await hatLineup(view, avatars);
    Object.assign(window, { mooblox: { ...view, view, probe: { ready: true } } });
    return;
  }
  const look: AvatarLook = { skin: 'b', tint: Palette.red };
  const dressed = new Outfitter(avatars);
  const player = await startPlayer(view, dressed, look);
  const interaction = startActivities(view, player, createOpenerRegistry(gateway), { store, gateway });
  const keep = (l: AvatarLook) => gateway.savePreference('local_mooblox_avatar', encodeLook(l));
  const picker = startAvatarPicker(view, player, dressed, look, keep, DEFAULT_AVATAR_PICKER_STRINGS);
  const weeks = params.has('weeks') ? Number(params.get('weeks')) : null;
  // The page's badges count as celebrated (`?fresh`: a first visit); `?earn` hands out "Island champion" 2.5 s after the start.
  if (!params.has('fresh')) localStorage.setItem(celebratedKey(0, fixture.courseid), JSON.stringify(rewards.trophies.map((t) => t.badgeid)));
  const rewardsUi = await startRewards(view, interaction, { gateway, courseId: fixture.courseid, userId: 0, strings: {}, assets: ASSETS, player, outfitter: dressed, picker, ...(weeks === null ? {} : { weeks: () => weeks }) });
  const sound = params.has('earn')
    ? startSound(view, player, { assets: ASSETS, stored: '', gateway, strings: {}, store, rewards: rewardsUi.store, bubble: null, badges: rewardsUi.badges })
    : null;
  if (params.has('earn')) {
    const [badge] = devTrophies(5).slice(4);
    window.setTimeout(() => {
      const r = rewardsUi.store.rewards!;
      rewardsUi.store.set({ ...r, trophies: [...r.trophies, { badgeId: 99, name: 'Island champion', imageUrl: badge!.image, timeIssued: Math.floor(Date.now() / 1000) }] });
    }, 2500);
  }
  const probe: Record<string, unknown> = { ready: true };
  Object.assign(window, { mooblox: { ...view, view, probe, player, interaction, store, gateway, picker, rewards: rewardsUi, sound } });
}

/** Every hat on a kid, two rows of six on the plaza, framed close (design review). */
async function hatLineup(view: WorldView, kit: AvatarKit): Promise<void> {
  const hats = await HatLibrary.load(ASSETS);
  const dressed = new Outfitter(kit);
  dressed.hats = hats;
  const ids = Object.keys(COSMETICS).filter((id) => COSMETICS[id]!.slot === 'hat');
  const looks = ['a', 'b', 'e', 'f', 'k', 'n'];
  const only = new URLSearchParams(location.search).get('row');
  for (const [i, id] of ids.entries()) {
    if (only !== null && Math.floor(i / 6) !== Number(only)) continue;
    dressed.worn = { hat: id, outfit: null, pet: null };
    const avatar = await dressed.create({ skin: looks[i % looks.length]!, tint: null });
    const row = Math.floor(i / 6);
    avatar.root.position.set(((i % 6) - 2.5) * 1.5, 0.02, only !== null ? -1 : -1 - row * 2.2);
    avatar.root.rotation.y = 0.35;
    view.stage.add(avatar.root);
  }
  view.stopOverview();
  if (only !== null) {
    view.stage.camera.position.set(0, 3.3, 4.6);
    view.stage.camera.lookAt(0, 2.1, -1);
  } else {
    view.stage.camera.position.set(0, 3.4, 7.2);
    view.stage.camera.lookAt(0, 1.4, -2);
  }
  view.stage.focusShadow(0, -2, 14);
}

boot().catch((e: unknown) => console.error('mooblox: rewards dev boot failed', e));
