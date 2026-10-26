import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeSound, parseSound, DEFAULT_SOUND } from '../../src/audio/settings';
import { musicFor, MUSIC, soundFiles } from '../../src/audio/sounds';
import { surfaceAt } from '../../src/audio/surface';
import { nearestFountain, HEAR } from '../../src/audio/water';

const audio = join(__dirname, '../../public/assets/audio');

describe('sound files', () => {
  it('ships every sound in Opus and AAC with a CC0 row', () => {
    const csv = readFileSync(join(audio, '../LICENSES.csv'), 'utf8');
    for (const stem of soundFiles()) {
      for (const ext of ['ogg', 'm4a']) {
        expect(existsSync(join(audio, `${stem}.${ext}`)), `${stem}.${ext}`).toBe(true);
        expect(csv).toContain(`"audio/${stem}.${ext}",`);
      }
    }
  });
});

describe('musicFor', () => {
  it('gives plazas the hub loop and alternates the districts', () => {
    expect(musicFor(0, 2)).toBe(MUSIC.hub);
    expect(musicFor(1, 2)).toBe(MUSIC.hub);
    expect([2, 3, 4].map((i) => musicFor(i, 2))).toEqual([MUSIC.districts[0], MUSIC.districts[1], MUSIC.districts[0]]);
  });
});

describe('sound settings', () => {
  it('round-trips and falls back on junk', () => {
    expect(parseSound(encodeSound({ on: false, volume: 0.4 }))).toEqual({ on: false, volume: 0.4 });
    expect(encodeSound({ on: true, volume: 1.7 })).toBe('on100');
    for (const junk of ['', null, undefined, 'loud', 'on', 'off-5', 'on1000']) expect(parseSound(junk)).toEqual(DEFAULT_SOUND);
  });
});

describe('surfaceAt', () => {
  const g = {
    bridges: [{ ax: 20, az: 0, bx: 40, bz: 0 }],
    paths: [{ ax: 50, az: -10, bx: 50, bz: 10 }],
    plazas: [{ x: 0, z: 0, r: 8 }],
  };
  it('tells planks, paving and lawn apart', () => {
    expect(surfaceAt(g, 30, 1)).toBe('wood');
    expect(surfaceAt(g, 30, 3)).toBe('grass');
    expect(surfaceAt(g, 3, 4)).toBe('stone');
    expect(surfaceAt(g, 51, 5)).toBe('stone');
    expect(surfaceAt(g, 12, 0)).toBe('grass');
  });
});

describe('nearestFountain', () => {
  const list = [{ x: 0, y: 0, z: 0, size: 1 }, { x: 10, y: 0, z: 0, size: 0.5 }];
  it('picks the nearest one within hearing and none past it', () => {
    expect(nearestFountain(list, 8, 0)).toBe(list[1]);
    expect(nearestFountain(list, -1, 0)).toBe(list[0]);
    expect(nearestFountain(list, 0, HEAR + 1)).toBeNull();
  });
});
