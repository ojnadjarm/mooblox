import { AjaxGateway } from '../moodle/ajax-gateway';
import { DEFAULT_LOOK_TIP_STRINGS } from '../ui/look-tip';
import { keepSessionAlive } from '../moodle/session-keeper';
import { CourseStore } from '../state/course-store';
import { createOpenerRegistry } from '../interaction/catalog';
import { Outfitter } from '../player/attachments';
import { AvatarKit } from '../player/avatar-kit';
import { decodeLook, encodeLook } from '../player/look';
import { DEFAULT_GUIDE_STRINGS } from '../tutor/guide';
import { DEFAULT_TUTOR_STRINGS, ScriptedTutor } from '../tutor/scripted-tutor';
import { DEFAULT_AVATAR_PICKER_STRINGS } from '../ui/avatar-picker';
import { preloadAssets } from './asset-preload';
import { BOOT_MODELS } from './boot-assets';
import { bootTier, startActivities, startAvatarPicker, startGuide, startPlayer, startWorld } from './app';
import { readConfig, type PlayConfig } from './config';
import { courseUrl, fallbackStrings, showFallback } from '../ui/world-fallback';
import { watchContext } from '../world/context-watch';
import { liveHandle } from './live-handle';
import { startRewards } from './rewards';
import { startSound } from './sound';
import { startHub } from './hub';
import { DEFAULT_HUB_BUTTON_STRINGS, hubButton } from '../ui/hub-button';
import { WhiteOut } from '../ui/white-out';
import { startArrival } from './arrival';
import { startReturnPortal } from './return-portal';
import { DEFAULT_GATE_STRINGS } from '../world/gates/gate-layer';
import { modelIds } from '../world/dressing';
import { startLife } from '../world/life';
import { ModelLibrary } from '../world/model-library';

const SESSION_TOUCH_MS = 5 * 60 * 1000;
const AVATAR_PREFERENCE = 'local_mooblox_avatar';

/** Composition root: reads the play.php config and wires the client. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root');
  if (!root) {
    throw new Error('missing #mooblox-root');
  }
  const assets = new URL(/* @vite-ignore */ './assets/', import.meta.url).href;
  const config = readConfig(document.getElementById('mooblox-config')?.textContent);
  if (config.mode === 'hub') {
    try {
      await openHub(root, config, assets);
    } catch (e) {
      showFallback(root, `${config.wwwroot}/my/courses.php`, fallbackStrings(config.strings));
      throw e;
    }
    return;
  }
  const preloaded = preloadAssets(assets, BOOT_MODELS);
  const fallback = () => showFallback(root, courseUrl(config.wwwroot, config.courseid), fallbackStrings(config.strings));
  try {
    await play(root, config, assets, preloaded, fallback);
  } catch (e) {
    fallback();
    throw e;
  }
}

/** Builds the hub with a portal to every course the user can play. */
async function openHub(root: HTMLElement, config: PlayConfig, assets: string): Promise<void> {
  const gateway = new AjaxGateway(config);
  keepSessionAlive(gateway, SESSION_TOUCH_MS, (e) => console.error('mooblox: session touch failed', e));
  const deps = { gateway, strings: config.strings, assets, avatar: config.avatar, sound: config.sound, from: config.courseid, navigate: (url: string) => location.assign(url) };
  Object.assign(window, { mooblox: await startHub(root, deps) });
}

/** Builds the world and its people for the course in `config`. */
async function play(root: HTMLElement, config: PlayConfig, assets: string, preloaded: Promise<void>, fallback: () => HTMLElement): Promise<void> {
  const gateway = new AjaxGateway(config);
  const whiteOut = new WhiteOut(root, config.arrival ? 1 : 0);
  if (config.arrival) history.replaceState(history.state, '', withoutWarpFlag(location.href));
  const store = new CourseStore();
  keepSessionAlive(gateway, SESSION_TOUCH_MS, (e) => console.error('mooblox: session touch failed', e));
  store.set(await gateway.getWorld(config.courseid));
  root.dataset['courseid'] = String(config.courseid);
  const xhigh = bootTier() === 'xhigh';
  await preloaded;
  const models = await ModelLibrary.load(assets, modelIds());
  const view = startWorld(root, store.world!, models, { ...DEFAULT_GATE_STRINGS, ...config.strings });
  let card: HTMLElement | null = null;
  watchContext(view.stage.renderer.domElement, {
    stuck: () => (card ??= fallback()),
    restored: () => {
      card?.remove();
      card = null;
    },
  });
  if (xhigh) void view.kit.loadDetail(assets);
  const avatars = await AvatarKit.load(assets);
  await startLife(view, models, view.quality.tier === 'low' ? null : avatars);
  const look = decodeLook(config.avatar, avatars.bodies.map((b) => b.id));
  const dressed = new Outfitter(avatars);
  const player = await startPlayer(view, dressed, look, [], { ...DEFAULT_LOOK_TIP_STRINGS, ...config.strings });
  const course = { store, gateway };
  const interaction = startActivities(view, player, createOpenerRegistry(gateway), course);
  const strings = config.strings;
  const keep = (l: typeof look) => gateway.savePreference(AVATAR_PREFERENCE, encodeLook(l));
  const picker = startAvatarPicker(view, player, dressed, look, keep, { ...DEFAULT_AVATAR_PICKER_STRINGS, ...strings });
  const rewards = await startRewards(view, interaction, { gateway, courseId: config.courseid, userId: config.userid, strings, assets, player, outfitter: dressed, picker });
  if (config.huburl) hubButton(root, config.huburl, { ...DEFAULT_HUB_BUTTON_STRINGS, ...strings });
  const guide = await startGuide(view, player, avatars, new ScriptedTutor({ ...DEFAULT_TUTOR_STRINGS, ...strings }), course, { ...DEFAULT_GUIDE_STRINGS, ...strings });
  const sound = startSound(view, player, { assets, stored: config.sound, gateway, strings, store, rewards: rewards.store, bubble: guide.bubble, collectibles: () => rewards.collectibles, goal: () => rewards.goal, badges: rewards.badges });
  const portal = config.huburl ? startReturnPortal(view, player, { huburl: config.huburl, navigate: (url) => window.open(url, '_top'), whiteOut, engine: () => sound.engine }) : null;
  const arrival = config.arrival ? startArrival(view, player, whiteOut, sound.arrive) : null;
  Object.assign(window, { mooblox: liveHandle(view, { view, player, interaction, store, guide, picker, rewards, sound, portal, arrival }) });
}

/** The page address without the portal-arrival flag (a reload is a normal entry). */
function withoutWarpFlag(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('warp');
  return url.href;
}

boot().catch((e: unknown) => console.error('mooblox: boot failed', e));
