import { NO_LOOK, type Look } from '../domain/rewards';
import type { ActivityInteraction } from '../interaction/activity-interaction';
import type { MoodleGateway } from '../moodle/gateway';
import type { Outfitter } from '../player/attachments';
import { HatLibrary } from '../player/hats';
import type { Player } from '../player/player';
import { levelUp } from '../rewards/level-up';
import { RewardsStore } from '../rewards/rewards-store';
import type { AvatarPicker } from '../ui/avatar-picker';
import { DEFAULT_HUD_STRINGS, hudView } from '../ui/hud-model';
import { HudRewards } from '../ui/hud-rewards';
import { LevelUpMoment } from '../ui/level-up';
import { WardrobeTab } from '../ui/wardrobe';
import { DEFAULT_WARDROBE_STRINGS, wardrobeItems } from '../ui/wardrobe-model';
import type { WorldView } from './app';

/** What the rewards wiring needs from the rest of the client. */
export interface RewardsDeps {
  readonly gateway: MoodleGateway;
  readonly courseId: number;
  readonly strings: Readonly<Record<string, string>>;
  readonly assets: string;
  readonly player: Player;
  /** The player's avatar factory; it dresses the player in the worn items. */
  readonly outfitter: Outfitter;
  readonly picker: AvatarPicker;
  /** Learning weeks to show by the leaf (server streaks, T1361); null hides the leaf. */
  readonly weeks?: () => number | null;
}

/** The running rewards UI. */
export interface RewardsRuntime {
  readonly store: RewardsStore;
  readonly levelUp: LevelUpMoment;
  /** What the player wears now. */
  readonly worn: Look;
  /** Re-reads the rewards from Moodle. */
  refresh(): Promise<void>;
}

/** Loads the user's rewards: HUD, level-up moment and wardrobe, kept in step after every activity close; nothing while off. */
export async function startRewards(view: WorldView, interaction: ActivityInteraction, deps: RewardsDeps): Promise<RewardsRuntime> {
  const store = new RewardsStore();
  const strings = { ...DEFAULT_HUD_STRINGS, ...deps.strings };
  const wardrobeStrings = { ...DEFAULT_WARDROBE_STRINGS, ...deps.strings };
  const host = view.stage.canvasHost;
  let hud: HudRewards | null = null;
  let worn: Look = NO_LOOK;
  let dressing: Promise<void> | null = null;
  const moment = new LevelUpMoment(host, { strings: deps.strings, tryOn: () => deps.picker.openTab('wardrobe') });
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
            deps.gateway.setLook(draft).catch((e: unknown) => {
              console.error('mooblox: saving the look failed', e);
              worn = before;
              void redress();
            });
          },
        },
        wardrobeStrings,
      ),
    );
  };
  store.subscribe((next, previous) => {
    const shown = hudView(next, deps.weeks?.() ?? null, strings);
    if (shown && !hud) hud = new HudRewards(host);
    hud?.show(shown);
    if (next.enabled && !dressing) dressing = dress(next.look).catch((e: unknown) => console.error('mooblox: loading the wardrobe failed', e));
    const up = levelUp(previous, next);
    if (up) moment.play(up);
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
    get worn() {
      return worn;
    },
    refresh,
  };
}
