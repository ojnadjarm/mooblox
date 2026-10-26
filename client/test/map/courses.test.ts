import { describe, expect, it } from 'vitest';
import { toMapCourses } from '../../src/map/courses';

const row = { id: 3, fullname: 'Volcanoes', summary: 'Hot rocks', image: '', progress: 50, completed: false, lastaccess: 0, url: 'https://m/local/mooblox/play.php?id=3' };

describe('toMapCourses', () => {
  it('keeps the known fields of every row', () => {
    expect(toMapCourses([{ ...row, extra: 1 }])).toEqual([row]);
  });

  it('refuses a wrong field type', () => {
    expect(() => toMapCourses([{ ...row, progress: '50' }])).toThrow('courses[0].progress');
    expect(() => toMapCourses({})).toThrow('not a list');
  });
});
