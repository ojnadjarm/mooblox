import type { ActivityInteraction } from '../interaction/activity-interaction';
import type { MoodleGateway } from '../moodle/gateway';
import { RewardsStore } from '../rewards/rewards-store';
import { DEFAULT_HUD_STRINGS, hudView } from '../ui/hud-model';
import { HudRewards } from '../ui/hud-rewards';
import type { WorldView } from './app';

/** What the rewards wiring needs from the rest of the client. */
export interface RewardsDeps {
  readonly gateway: MoodleGateway;
  readonly courseId: number;
  readonly strings: Readonly<Record<string, string>>;
  /** Learning weeks to show by the leaf (server streaks, T1361); null hides the leaf. */
  readonly weeks?: () => number | null;
}

/** The running rewards UI. */
export interface RewardsRuntime {
  readonly store: RewardsStore;
  /** Re-reads the rewards from Moodle. */
  refresh(): Promise<void>;
}

/** Loads the user's rewards and keeps the HUD in step after every activity close; builds nothing while rewards are off. */
export async function startRewards(view: WorldView, interaction: ActivityInteraction, deps: RewardsDeps): Promise<RewardsRuntime> {
  const store = new RewardsStore();
  const strings = { ...DEFAULT_HUD_STRINGS, ...deps.strings };
  let hud: HudRewards | null = null;
  store.subscribe((next) => {
    const shown = hudView(next, deps.weeks?.() ?? null, strings);
    if (shown && !hud) hud = new HudRewards(view.stage.canvasHost);
    hud?.show(shown);
  });
  const refresh = async (): Promise<void> => {
    try {
      store.set(await deps.gateway.getRewards(deps.courseId));
    } catch (e) {
      console.error('mooblox: loading rewards failed', e);
    }
  };
  await refresh();
  interaction.onClosed(() => void refresh());
  return { store, refresh };
}
