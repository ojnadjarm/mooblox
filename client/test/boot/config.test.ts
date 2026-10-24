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
    expect(readConfig(JSON.stringify(valid))).toEqual({ ...valid, wwwroot: 'https://moodle.example' });
  });

  it.each([
    ['missing', null],
    ['not JSON', '{'],
    ['not an object', '1'],
    ['wrong type', JSON.stringify({ ...valid, courseid: '30' })],
    ['missing key', JSON.stringify({ ...valid, sesskey: undefined })],
  ])('rejects a config that is %s', (_label, json) => {
    expect(() => readConfig(json)).toThrow(ConfigError);
  });
});
