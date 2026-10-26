/** A badge the user holds in a course. */
export interface HubTrophy {
  readonly badgeid: number;
  readonly name: string;
  readonly image: string;
  readonly timeissued: number;
}

/** One course the user can enter, as `local_mooblox_get_courses` returns it. */
export interface HubCourse {
  readonly id: number;
  readonly fullname: string;
  readonly summary: string;
  /** Course image URL, '' when none. */
  readonly image: string;
  /** Activities done in percent, -1 when completion is not tracked. */
  readonly progress: number;
  readonly completed: boolean;
  /** Last visit (epoch s), 0 when never. */
  readonly lastaccess: number;
  /** The course world (play.php). */
  readonly url: string;
  readonly xp: number;
  readonly level: number;
  readonly gems: number;
  readonly gemstotal: number;
  readonly crystals: number;
  readonly stars: number;
  readonly trophies: readonly HubTrophy[];
}

/** Transport for the hub. */
export interface CourseListGateway {
  getCourses(): Promise<HubCourse[]>;
}

type Kind = 'number' | 'string' | 'boolean';

const FIELDS: Readonly<Record<Exclude<keyof HubCourse, 'trophies'>, Kind>> = {
  id: 'number',
  fullname: 'string',
  summary: 'string',
  image: 'string',
  progress: 'number',
  completed: 'boolean',
  lastaccess: 'number',
  url: 'string',
  xp: 'number',
  level: 'number',
  gems: 'number',
  gemstotal: 'number',
  crystals: 'number',
  stars: 'number',
};

const TROPHY: Readonly<Record<keyof HubTrophy, Kind>> = { badgeid: 'number', name: 'string', image: 'string', timeissued: 'number' };

/** Copies the `fields` of `row`, checking each type; throws naming the first bad one. */
function pick<T>(row: unknown, fields: Readonly<Record<string, Kind>>, at: string): T {
  if (typeof row !== 'object' || row === null) throw new Error(`${at} is not an object`);
  const o = row as Record<string, unknown>;
  for (const [key, type] of Object.entries(fields)) {
    if (typeof o[key] !== type) throw new Error(`${at}.${key} must be a ${type}`);
  }
  return Object.fromEntries(Object.keys(fields).map((k) => [k, o[k]])) as T;
}

/** Validates the wire list; throws an Error naming the first bad field. */
export function toHubCourses(dto: unknown): HubCourse[] {
  if (!Array.isArray(dto)) throw new Error('courses is not a list');
  return dto.map((row: unknown, i) => {
    const course = pick<Omit<HubCourse, 'trophies'>>(row, FIELDS, `courses[${i}]`);
    const trophies = (row as { trophies?: unknown }).trophies;
    if (!Array.isArray(trophies)) throw new Error(`courses[${i}].trophies must be a list`);
    return { ...course, trophies: trophies.map((t: unknown, k) => pick<HubTrophy>(t, TROPHY, `courses[${i}].trophies[${k}]`)) };
  });
}

/** Courses for the hub's pads: last visited first, never-visited ones after them by name. */
export function byLastAccess(courses: readonly HubCourse[]): HubCourse[] {
  return [...courses].sort((a, b) => b.lastaccess - a.lastaccess || a.fullname.localeCompare(b.fullname) || a.id - b.id);
}

/** What the show-off area displays: every trophy (oldest first) and the totals over all courses. */
export interface HubTotals {
  readonly trophies: readonly HubTrophy[];
  readonly gems: number;
  readonly crystals: number;
  readonly stars: number;
  readonly xp: number;
  /** The player level of the summed XP on the course level curve. */
  readonly level: number;
}

/** Level reached with `xp` on the rewards curve (level n needs 25·n·(n+1) XP, as `rewards\level_curve`). */
export function levelFor(xp: number): number {
  let n = 0;
  while (25 * (n + 1) * (n + 2) <= xp) n++;
  return n;
}

/** Sums every course's rewards. */
export function hubTotals(courses: readonly HubCourse[]): HubTotals {
  const sum = (key: 'gems' | 'crystals' | 'stars' | 'xp') => courses.reduce((n, c) => n + c[key], 0);
  const trophies = courses.flatMap((c) => c.trophies).sort((a, b) => a.timeissued - b.timeissued || a.badgeid - b.badgeid);
  const xp = sum('xp');
  return { trophies, gems: sum('gems'), crystals: sum('crystals'), stars: sum('stars'), xp, level: levelFor(xp) };
}
