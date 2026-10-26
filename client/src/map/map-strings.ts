/** Texts of the course map (play config `strings`, `map_*` keys). */
export interface MapStrings {
  readonly map_title: string;
  readonly map_hint: string;
  readonly map_play: string;
  readonly map_close: string;
  readonly map_progress: string;
  readonly map_done: string;
  readonly map_free: string;
  readonly map_lastvisit: string;
  readonly map_never: string;
  readonly map_empty_title: string;
  readonly map_empty_text: string;
  readonly map_list: string;
}

export const DEFAULT_MAP_STRINGS: MapStrings = {
  map_title: 'Your worlds',
  map_hint: 'Pick an island to play',
  map_play: 'Play',
  map_close: 'Close',
  map_progress: '{progress}% done',
  map_done: 'Finished!',
  map_free: 'Explore freely',
  map_lastvisit: 'Last visit: {when}',
  map_never: 'New! Not visited yet',
  map_empty_title: 'No worlds yet',
  map_empty_text: 'When your teacher adds you to a course, its island shows up here.',
  map_list: 'Your worlds, one island for each course',
};

/** The map texts from the config strings, defaults for missing keys. */
export function mapStrings(strings: Readonly<Record<string, string>>): MapStrings {
  const s: Record<string, string> = { ...DEFAULT_MAP_STRINGS };
  for (const key of Object.keys(s)) if (strings[key]) s[key] = strings[key];
  return s as unknown as MapStrings;
}

/** "Last visit: 3 days ago" (relative, in the page language) or the never-visited text. */
export function visitText(s: MapStrings, lastaccess: number, now: number, lang?: string): string {
  if (lastaccess <= 0) return s.map_never;
  const days = Math.floor(now / 86400) - Math.floor(lastaccess / 86400);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const when = days < 30 ? rtf.format(-days, 'day') : days < 365 ? rtf.format(-Math.floor(days / 30), 'month') : rtf.format(-Math.floor(days / 365), 'year');
  return s.map_lastvisit.replace('{when}', when);
}

/** The progress line of a course: finished, percent done or free browse. */
export function progressText(s: MapStrings, progress: number, completed: boolean): string {
  if (completed) return s.map_done;
  if (progress < 0) return s.map_free;
  return s.map_progress.replace('{progress}', String(progress));
}
