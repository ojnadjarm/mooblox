import { NO_LOOK, type Look } from '../domain/rewards';
import type { MoodleGateway } from '../moodle/gateway';
import type { Outfitter } from '../player/attachments';
import { HatLibrary } from '../player/hats';
import { PetFollower } from '../player/pet';
import { PetLibrary } from '../player/pets';
import type { Player } from '../player/player';
import { itemName } from '../rewards/item-names';
import { levelUp } from '../rewards/level-up';
import { badgesToCelebrate, celebratedKey, parseCelebrated } from '../rewards/new-badges';
import { RewardsStore } from '../rewards/rewards-store';
import type { AvatarPicker } from '../ui/avatar-picker';
import { DEFAULT_HUD_STRINGS, hudView } from '../ui/hud-model';
import { HudRewards } from '../ui/hud-rewards';
import { BadgeMoment } from '../ui/badge-moment';
import { LevelUpMoment } from '../ui/level-up';
import { WardrobeTab } from '../ui/wardrobe';
import { DEFAULT_WARDROBE_STRINGS, wardrobeItems } from '../ui/wardrobe-model';
import type { Activities, WorldView } from './app';
import { startCollectibles, type CollectiblesRuntime } from './collectibles';
import { addRewardsPages } from './book-pages';
import { startTrophyHall, type TrophyHallRuntime } from './trophy-hall';
import { startClassGoal, type ClassGoalRuntime } from './class-goal';

/** What the rewards wiring needs from the rest of the client. */
export interface RewardsDeps {
  readonly gateway: MoodleGateway;
  readonly courseId: number;
  /** The Moodle user id: celebrated badges are remembered per user and course in this browser. */
  readonly userId: number;
  readonly strings: Readonly<Record<string, string>>;
  readonly assets: string;
  readonly player: Player;
  /** The player's avatar factory; it dresses the player in the worn items. */
  readonly outfitter: Outfitter;
  readonly picker: AvatarPicker;
  /** Overrides the learning weeks shown by the leaf (dev page); null hides the leaf. */
  readonly weeks?: () => number | null;
}

/** The running rewards UI. */
export interface RewardsRuntime {
  readonly store: RewardsStore;
  readonly levelUp: LevelUpMoment;
  /** "You earned <badge>!" for badges not celebrated yet. */
  readonly badges: BadgeMoment;
  /** What the player wears now. */
  readonly worn: Look;
  /** The pet walking after the player. */
  readonly pet: PetFollower;
  /** Gems, crystals and stars in the world; null while rewards are off. */
  readonly collectibles: CollectiblesRuntime | null;
  /** The trophy hall in the hub; null while rewards are off. */
  readonly hall: TrophyHallRuntime | null;
  /** The class goal monument and its fireworks; null while rewards are off. */
  readonly goal: ClassGoalRuntime | null;
  /** Re-reads the rewards from Moodle. */
  refresh(): Promise<void>;
}

/** Pause (ms) between the first key or tap and a moment waiting for it. */
const GESTURE_DELAY_MS = 600;

/** Runs `f` shortly after the player's first key or tap on the page. */
function afterFirstGesture(f: () => void): void {
  const go = (): void => {
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
    window.setTimeout(f, GESTURE_DELAY_MS);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

/** Loads the user's rewards: HUD, level-up moment and wardrobe, kept in step after every activity close; nothing while off. */
export async function startRewards(view: WorldView, interaction: Activities, deps: RewardsDeps): Promise<RewardsRuntime> {
  const store = new RewardsStore();
  const strings = { ...DEFAULT_HUD_STRINGS, ...deps.strings };
  const wardrobeStrings = { ...DEFAULT_WARDROBE_STRINGS, ...deps.strings };
  const host = view.stage.canvasHost;
  let hud: HudRewards | null = null;
  let collectibles: CollectiblesRuntime | null = null;
  let hall: TrophyHallRuntime | null = null;
  let goal: ClassGoalRuntime | null = null;
  let worn: Look = NO_LOOK;
  let dressing: Promise<void> | null = null;
  const moment = new LevelUpMoment(host, { strings: deps.strings, tryOn: () => deps.picker.openTab('wardrobe'), chime: false });
  const badges = new BadgeMoment(host, { strings: deps.strings });
  const celebrated = celebratedKey(deps.userId, deps.courseId);
  const pet = new PetFollower(
    () => ({ position: deps.player.avatar.root.position, yaw: deps.player.avatar.root.rotation.y }),
    (o) => view.stage.add(o),
  );
  let pets: Promise<PetLibrary> | null = null;
  let shownPet = '';
  /** Walks the worn pet in the world (shadow on high and xhigh); on low only the HUD badge shows it. */
  const syncPet = async (): Promise<void> => {
    const tier = view.quality.tier;
    const key = `${worn.pet ?? ''}|${tier}`;
    if (key === shownPet) return;
    shownPet = key;
    const low = tier === 'low';
    hud?.showPet(worn.pet && low ? itemName(worn.pet, deps.strings) : null);
    if (!worn.pet || low) {
      pet.wear(null);
      return;
    }
    const id = worn.pet;
    const library = await (pets ??= PetLibrary.load(deps.assets));
    if (shownPet !== key || !library.has(id)) return;
    pet.wear(library.create(id), tier === 'high' || tier === 'xhigh');
    view.gate.invalidate();
  };
  const showPet = (): void => void syncPet().catch((e: unknown) => console.error('mooblox: loading the pet failed', e));
  view.onFrame((dt) => {
    if (`${worn.pet ?? ''}|${view.quality.tier}` !== shownPet) showPet();
    pet.step(dt);
  });
  const redress = async (): Promise<void> => {
    deps.outfitter.worn = worn;
    deps.player.setAvatar(await deps.outfitter.create(deps.picker.current)).dispose();
    view.gate.invalidate();
  };
  /** First enabled read: loads the hat models, wears the saved look and adds the Wardrobe tab. */
  const dress = async (look: Look): Promise<void> => {
    deps.outfitter.hats = await HatLibrary.load(deps.assets);
    worn = look;
    if (look.hat || look.outfit) await redress();
    showPet();
    deps.picker.addTab(
      new WardrobeTab(
        {
          items: () => wardrobeItems(store.rewards!, wardrobeStrings, deps.strings),
          get worn() {
            return worn;
          },
          preview: (draft) => (deps.outfitter.worn = draft),
          keep: (draft) => {
            const before = worn;
            worn = draft;
            showPet();
            deps.gateway.setLook(draft).catch((e: unknown) => {
              console.error('mooblox: saving the look failed', e);
              worn = before;
              void redress();
              showPet();
            });
          },
        },
        wardrobeStrings,
      ),
    );
  };
  store.subscribe((next, previous) => {
    const shown = hudView(next, deps.weeks ? deps.weeks() : next.weeks.count || null, strings);
    if (shown && !hud) hud = new HudRewards(host);
    hud?.show(shown);
    if (next.enabled && !dressing) dressing = dress(next.look).catch((e: unknown) => console.error('mooblox: loading the wardrobe failed', e));
    if (next.enabled && !collectibles) {
      collectibles = startCollectibles(view, deps.player, store, deps.gateway, deps.courseId, deps.strings);
      addRewardsPages(interaction.book, store, () => view.world, deps.strings);
      hall = startTrophyHall(view, store);
      goal = startClassGoal(view, store, deps.courseId, deps.strings);
    }
    const up = levelUp(previous, next);
    const earned = next.enabled ? badgesToCelebrate(next.trophies, parseCelebrated(localStorage.getItem(celebrated)), Date.now() / 1000) : [];
    if (next.enabled) localStorage.setItem(celebrated, JSON.stringify(next.trophies.map((t) => t.badgeId)));
    // The badge comes first: its XP is what lifted the level. One that arrived between visits waits for the first key or
    // tap, the gesture that lets the fanfare play.
    const celebrate = (): void => badges.play(earned, up ? () => moment.play(up) : undefined);
    if (earned.length && previous) celebrate();
    else if (earned.length) afterFirstGesture(celebrate);
    else if (up) moment.play(up);
  });
  const refresh = async (): Promise<void> => {
    try {
      store.set(await deps.gateway.getRewards(deps.courseId));
    } catch (e) {
      console.error('mooblox: loading rewards failed', e);
    }
  };
  await refresh();
  await dressing;
  interaction.onClosed(() => void refresh());
  return {
    store,
    levelUp: moment,
    badges,
    get worn() {
      return worn;
    },
    pet,
    get collectibles() {
      return collectibles;
    },
    get hall() {
      return hall;
    },
    get goal() {
      return goal;
    },
    refresh,
  };
}
