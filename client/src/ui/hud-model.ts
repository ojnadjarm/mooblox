import type { Quest, Rewards } from '../domain/rewards';

/** HUD texts; `{level}`, `{xp}`, `{next}`, `{done}`, `{total}` and `{weeks}` are filled in. */
export interface HudStrings {
  readonly hud_level: string;
  readonly hud_xp: string;
  readonly hud_progress: string;
  readonly hud_alldone: string;
  readonly hud_week: string;
  readonly hud_weeks: string;
  readonly hud_welcome: string;
}

export const DEFAULT_HUD_STRINGS: HudStrings = {
  hud_level: 'Level {level}',
  hud_xp: '{xp} / {next} XP',
  hud_progress: '{done}/{total}',
  hud_alldone: 'Every quest done!',
  hud_week: '1 learning week',
  hud_weeks: '{weeks} learning weeks',
  hud_welcome: 'Welcome back!',
};

/** What the rewards HUD shows. */
export interface HudView {
  readonly level: number;
  readonly levelLabel: string;
  /** Share of the way from this level to the next, 0..1. */
  readonly fraction: number;
  readonly xpLabel: string;
  readonly quest: string;
  /** Quest progress (`2/3`), empty when every quest is done. */
  readonly progress: string;
  /** Learning weeks label, null when there are none to show. */
  readonly weeks: string | null;
  readonly weekCount: number;
}

/** The HUD view of `rewards`, or null when rewards are off (no HUD at all). */
export function hudView(rewards: Rewards, weeks: number | null, s: HudStrings = DEFAULT_HUD_STRINGS): HudView | null {
  if (!rewards.enabled) {
    return null;
  }
  const span = rewards.levelNext - rewards.levelStart;
  const fraction = span > 0 ? Math.min(1, Math.max(0, (rewards.xp - rewards.levelStart) / span)) : 1;
  const quest = nextQuest(rewards.quests);
  return {
    level: rewards.level,
    levelLabel: fill(s.hud_level, { level: rewards.level }),
    fraction,
    xpLabel: fill(s.hud_xp, { xp: rewards.xp, next: rewards.levelNext }),
    quest: quest ? quest.text : s.hud_alldone,
    progress: quest ? fill(s.hud_progress, { done: quest.done, total: quest.total }) : '',
    weeks: weeks && weeks > 0 ? (weeks === 1 && rewards.weeks.welcomeBack ? s.hud_welcome : fill(weeks === 1 ? s.hud_week : s.hud_weeks, { weeks })) : null,
    weekCount: weeks && weeks > 0 ? weeks : 0,
  };
}

/** The open quest closest to done (first in server order on a tie), null when all are done. */
export function nextQuest(quests: readonly Quest[]): Quest | null {
  let best: Quest | null = null;
  for (const q of quests) {
    if (!q.complete && (!best || share(q) > share(best))) {
      best = q;
    }
  }
  return best;
}

const share = (q: Quest): number => (q.total > 0 ? q.done / q.total : 0);

/** Replaces `{name}` placeholders. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
