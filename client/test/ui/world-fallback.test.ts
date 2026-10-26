import { describe, expect, it } from 'vitest';
import { courseUrl, DEFAULT_FALLBACK_STRINGS, fallbackStrings } from '../../src/ui/world-fallback';

describe('world fallback', () => {
  it('links to the normal course page', () => {
    expect(courseUrl('https://moodle.example', 42)).toBe('https://moodle.example/course/view.php?id=42');
  });

  it('takes lang strings from the config over the defaults', () => {
    const s = fallbackStrings({ fallback_link: 'Zur Kursseite', other: 'x' });
    expect(s.fallback_link).toBe('Zur Kursseite');
    expect(s.fallback_title).toBe(DEFAULT_FALLBACK_STRINGS.fallback_title);
  });
});
