import type { Trophy } from '../domain/rewards';

/** Without a record in this browser, badges issued this recently (s) still get their moment. */
export const RECENT_S = 7 * 86400;

/** localStorage key of the badge ids already celebrated for a user in a course. */
export const celebratedKey = (userId: number, courseId: number): string => `mooblox-badges-${userId}-${courseId}`;

/**
 * Badges to celebrate now, oldest first: earned and not in `celebrated`; with no record yet (null), those issued within
 * `RECENT_S` of `now` (unix s), so a badge that arrived between visits still gets its moment and old ones do not.
 */
export function badgesToCelebrate(trophies: readonly Trophy[], celebrated: readonly number[] | null, now: number): Trophy[] {
  const had = new Set(celebrated ?? []);
  return trophies
    .filter((t) => (celebrated ? !had.has(t.badgeId) : now - t.timeIssued <= RECENT_S))
    .sort((a, b) => a.timeIssued - b.timeIssued || a.badgeId - b.badgeId);
}

/** Reads a stored record: the ids, or null when missing or unreadable. */
export function parseCelebrated(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.every((x) => Number.isInteger(x)) ? (v as number[]) : null;
  } catch {
    return null;
  }
}
