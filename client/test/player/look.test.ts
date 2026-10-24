import { describe, expect, it } from 'vitest';
import { decodeLook, encodeLook, SHIRT_COLOURS } from '../../src/player/look';

const BODIES = ['a', 'b', 'c'];

describe('look codec', () => {
  it('round-trips a body with a palette colour', () => {
    const look = { skin: 'c', tint: SHIRT_COLOURS['green']! };
    expect(encodeLook(look)).toBe('c_green');
    expect(decodeLook('c_green', BODIES)).toEqual(look);
  });

  it('keeps the original clothes without a colour', () => {
    expect(encodeLook({ skin: 'b', tint: null })).toBe('b');
    expect(decodeLook('b', BODIES)).toEqual({ skin: 'b', tint: null });
  });

  it('falls back on unknown or empty values', () => {
    expect(decodeLook('', BODIES)).toEqual({ skin: 'a', tint: null });
    expect(decodeLook('z_mauve', BODIES)).toEqual({ skin: 'a', tint: null });
  });

  it('only encodes values the preference accepts (alphanumeric, _ and -)', () => {
    for (const key of Object.keys(SHIRT_COLOURS)) {
      expect(encodeLook({ skin: 'r', tint: SHIRT_COLOURS[key]! })).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
