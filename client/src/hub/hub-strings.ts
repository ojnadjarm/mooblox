/** Texts of the hub (play config `strings`, `hub_*` keys). */
export interface HubStrings {
  readonly hub_title: string;
  readonly hub_hint: string;
  readonly hub_progress: string;
  readonly hub_done: string;
  readonly hub_free: string;
  readonly hub_new: string;
  readonly hub_floor: string;
  readonly hub_up: string;
  readonly hub_down: string;
  readonly hub_gems: string;
  readonly hub_crystals: string;
  readonly hub_stars: string;
  readonly hub_trophies: string;
  readonly hub_level: string;
  readonly hub_xp: string;
  readonly hub_warping: string;
  readonly hub_empty_title: string;
  readonly hub_empty_text: string;
  readonly hub_list: string;
}

export const DEFAULT_HUB_STRINGS: HubStrings = {
  hub_title: 'Your worlds',
  hub_hint: 'Walk onto a portal pad to jump into a world',
  hub_progress: '{progress}% done',
  hub_done: 'Finished!',
  hub_free: 'Explore freely',
  hub_new: 'New!',
  hub_floor: 'Floor {floor} of {floors}',
  hub_up: 'Floor above',
  hub_down: 'Floor below',
  hub_gems: 'Gems',
  hub_crystals: 'Crystals',
  hub_stars: 'Stars',
  hub_trophies: 'Trophies',
  hub_level: 'Level {level}',
  hub_xp: '{xp} XP',
  hub_warping: 'Off to {name}!',
  hub_empty_title: 'No worlds yet',
  hub_empty_text: 'When your teacher adds you to a course, its portal lights up here.',
  hub_list: 'Your worlds, one portal for each course',
};

/** The hub texts from the config strings, defaults for missing keys. */
export function hubStrings(strings: Readonly<Record<string, string>>): HubStrings {
  const s: Record<string, string> = { ...DEFAULT_HUB_STRINGS };
  for (const key of Object.keys(s)) if (strings[key]) s[key] = strings[key];
  return s as unknown as HubStrings;
}

/** Fills `{name}` placeholders. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** The progress line of a course: finished, percent done or free browse. */
export function progressText(s: HubStrings, progress: number, completed: boolean): string {
  if (completed) return s.hub_done;
  if (progress < 0) return s.hub_free;
  return fill(s.hub_progress, { progress });
}
