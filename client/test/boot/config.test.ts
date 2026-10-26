import { describe, expect, it } from 'vitest';
import { ConfigError, readConfig } from '../../src/boot/config';

const valid = {
  wwwroot: 'https://moodle.example/',
  courseid: 30,
  sesskey: 'abc123',
  firstname: 'Mia',
  avatar: '',
  rev: 2026102405,
};

describe('readConfig', () => {
  it('parses the play.php config and trims the wwwroot slash', () => {
    expect(readConfig(JSON.stringify(valid))).toEqual({ ...valid, wwwroot: 'https://moodle.example', userid: 0, sound: '', mode: 'play', mapurl: '', strings: {} });
    expect(readConfig(JSON.stringify({ ...valid, mode: 'map', mapurl: 'https://m/local/mooblox/index.php' }))).toMatchObject({ mode: 'map', mapurl: 'https://m/local/mooblox/index.php' });
    expect(readConfig(JSON.stringify({ ...valid, userid: 64 })).userid).toBe(64);
    expect(readConfig(JSON.stringify({ ...valid, sound: 'off40' })).sound).toBe('off40');
    const strings = { guide: 'Guide' };
    expect(readConfig(JSON.stringify({ ...valid, strings })).strings).toEqual(strings);
  });

  it.each([
    ['missing', null],
    ['not JSON', '{'],
    ['not an object', '1'],
    ['wrong type', JSON.stringify({ ...valid, courseid: '30' })],
    ['missing key', JSON.stringify({ ...valid, sesskey: undefined })],
    ['strings not text', JSON.stringify({ ...valid, strings: { guide: 1 } })],
    ['sound not text', JSON.stringify({ ...valid, sound: 40 })],
    ['userid not a number', JSON.stringify({ ...valid, userid: '64' })],
  ])('rejects a config that is %s', (_label, json) => {
    expect(() => readConfig(json)).toThrow(ConfigError);
  });
});
