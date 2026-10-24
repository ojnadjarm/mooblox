import { describe, expect, it } from 'vitest';
import { CLOTH, colourOf, FIELDS, OPTIONS } from '../../src/player/character/catalog';
import { DEFAULT_LOOK, isValidLook, LEGACY_BODIES, migrateLegacy, parseLook, randomLook } from '../../src/player/character/look';
import { decodeLook, encodeLook } from '../../src/player/look';

describe('character look schema', () => {
  it('meets the brief: 10+ hairstyles, blonde and 4 fun hair colours, 8+ skin tones, 3+ face shapes', () => {
    expect(OPTIONS.hair.length).toBeGreaterThanOrEqual(10);
    for (const s of ['short', 'long', 'curly', 'afro', 'braids', 'ponytail', 'buns', 'buzz', 'bob', 'spiky']) expect(OPTIONS.hair).toContain(s);
    for (const c of ['blonde', 'platinum', 'brown', 'black', 'auburn', 'red', 'pink', 'blue', 'purple', 'green']) expect(OPTIONS.hairc).toContain(c);
    for (const c of ['brown', 'hazel', 'green', 'blue', 'grey']) expect(OPTIONS.eyec).toContain(c);
    expect(OPTIONS.skin.length).toBeGreaterThanOrEqual(8);
    for (const f of ['eyes', 'brows', 'mouth', 'top', 'bottom', 'shoes'] as const) expect(OPTIONS[f].length).toBeGreaterThanOrEqual(3);
  });

  it('has a display colour for every colour id', () => {
    for (const f of FIELDS.filter((x) => x === 'skin' || x.endsWith('c'))) {
      for (const id of OPTIONS[f]) expect(colourOf(f, id), `${f}.${id}`).not.toBeNull();
    }
  });

  it('round-trips through the preference value and stays small', () => {
    const look = { ...DEFAULT_LOOK, hair: 'afro', hairc: 'blonde', glasses: 'stars' };
    const value = encodeLook(look);
    expect(value.length).toBeLessThan(300);
    expect(decodeLook(value)).toEqual(look);
  });

  it('rejects unknown ids, extra keys, wrong versions and garbage', () => {
    const bad = [
      JSON.stringify({ ...DEFAULT_LOOK, hair: 'mullet' }),
      JSON.stringify({ ...DEFAULT_LOOK, extra: 'x' }),
      JSON.stringify({ ...DEFAULT_LOOK, v: 1 }),
      '{"v":2',
      'zz_top',
      '',
    ];
    for (const value of bad) expect(parseLook(value)).toEqual(DEFAULT_LOOK);
    expect(isValidLook({ ...DEFAULT_LOOK, skin: 7 })).toBe(false);
  });

  it('migrates every T1302 value: body letters, with and without a shirt colour', () => {
    for (const body of LEGACY_BODIES) {
      expect(isValidLook(parseLook(body))).toBe(true);
      expect(parseLook(`${body}_green`).topc).toBe('green');
    }
    expect(parseLook('f_purple')).toEqual(migrateLegacy({ skin: 'f', tint: CLOTH['purple']! }));
    expect(migrateLegacy({ skin: 'n', tint: 0xffd43b }).topc).toBe('yellow');
    expect(isValidLook(migrateLegacy({ skin: 'zz', tint: null }))).toBe(true);
  });

  it('random looks are always valid', () => {
    let seed = 3;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 2000; i++) expect(isValidLook(randomLook(random))).toBe(true);
    expect(isValidLook(randomLook(() => 0.999999))).toBe(true);
    expect(isValidLook(randomLook(() => 0))).toBe(true);
  });
});
