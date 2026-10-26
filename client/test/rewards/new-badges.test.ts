import { describe, expect, it } from 'vitest';
import type { Trophy } from '../../src/domain/rewards';
import { badgesToCelebrate, celebratedKey, parseCelebrated, RECENT_S } from '../../src/rewards/new-badges';

const NOW = 1_800_000_000;
const badge = (badgeId: number, ago: number): Trophy => ({ badgeId, name: `B${badgeId}`, imageUrl: '', timeIssued: NOW - ago });

describe('badgesToCelebrate', () => {
  it('celebrates only badges not celebrated before, oldest first', () => {
    const trophies = [badge(4, 10), badge(2, 9000), badge(7, 50)];
    expect(badgesToCelebrate(trophies, [2], NOW).map((t) => t.badgeId)).toEqual([7, 4]);
    expect(badgesToCelebrate(trophies, [2, 4, 7], NOW)).toEqual([]);
  });

  it('without a record celebrates only recent badges', () => {
    const trophies = [badge(1, RECENT_S + 60), badge(4, 3600)];
    expect(badgesToCelebrate(trophies, null, NOW).map((t) => t.badgeId)).toEqual([4]);
    expect(badgesToCelebrate(trophies, [], NOW).map((t) => t.badgeId)).toEqual([1, 4]);
  });
});

describe('celebrated record', () => {
  it('keys per user and course', () => {
    expect(celebratedKey(64, 87)).toBe('mooblox-badges-64-87');
    expect(celebratedKey(65, 87)).not.toBe(celebratedKey(64, 87));
  });

  it('reads ids, null for missing or broken records', () => {
    expect(parseCelebrated('[4,7]')).toEqual([4, 7]);
    expect(parseCelebrated(null)).toBeNull();
    expect(parseCelebrated('{')).toBeNull();
    expect(parseCelebrated('["x"]')).toBeNull();
  });
});
