import { describe, expect, it } from 'vitest';
import { hubTotals, levelFor, toHubCourses, type HubCourse } from '../../src/hub/courses';

const trophy = { badgeid: 7, name: 'Quiz whiz', image: 'https://m/badge.png', timeissued: 50 };
const row = {
  id: 3, fullname: 'Volcanoes', summary: 'Hot rocks', image: '', progress: 50, completed: false, lastaccess: 0, url: 'https://m/local/mooblox/play.php?id=3',
  xp: 80, level: 1, gems: 2, gemstotal: 5, crystals: 1, stars: 0, trophies: [trophy],
};
const course = (id: number, lastaccess: number, more: Partial<HubCourse> = {}): HubCourse => ({ ...row, id, fullname: `C${id}`, lastaccess, ...more });

describe('toHubCourses', () => {
  it('keeps the known fields of every row and its trophies', () => {
    expect(toHubCourses([{ ...row, extra: 1, trophies: [{ ...trophy, extra: 2 }] }])).toEqual([row]);
  });

  it('refuses a wrong field type', () => {
    expect(() => toHubCourses([{ ...row, progress: '50' }])).toThrow('courses[0].progress');
    expect(() => toHubCourses([{ ...row, trophies: [{ ...trophy, name: 3 }] }])).toThrow('courses[0].trophies[0].name');
    expect(() => toHubCourses([{ ...row, trophies: null }])).toThrow('courses[0].trophies');
    expect(() => toHubCourses({})).toThrow('not a list');
  });
});

describe('pad order', () => {
  it('keeps the server course order, so a reload or a visit moves no pad', () => {
    const wire = (visits: number[]) => [5, 2, 9, 4].map((id, i) => ({ ...row, id, lastaccess: visits[i]! }));
    const pads = (visits: number[]) => toHubCourses(wire(visits)).map((c) => c.id);
    expect(pads([0, 0, 0, 0])).toEqual([5, 2, 9, 4]);
    expect(pads([0, 0, 0, 0])).toEqual(pads([0, 0, 0, 0]));
    expect(pads([0, 0, 900, 100])).toEqual([5, 2, 9, 4]);
  });
});

describe('hubTotals', () => {
  it('sums every course and levels the summed XP on the course curve', () => {
    const t = hubTotals([course(1, 0, { xp: 100, trophies: [{ ...trophy, badgeid: 9, timeissued: 90 }] }), course(2, 0, { xp: 60, gems: 3, stars: 2 })]);
    expect(t).toMatchObject({ gems: 5, crystals: 2, stars: 2, xp: 160, level: 2 });
    expect(t.trophies.map((x) => x.badgeid)).toEqual([7, 9]);
  });

  it('levels like rewards\\level_curve (25 n (n + 1))', () => {
    expect([0, 49, 50, 149, 150, 300].map(levelFor)).toEqual([0, 0, 1, 1, 2, 3]);
  });
});
