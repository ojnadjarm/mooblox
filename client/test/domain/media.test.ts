import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { toWorld } from '../../src/domain/mapper';
import { playable, youtubeId } from '../../src/domain/media';

const activities = toWorld(fixture).sections.flatMap((s) => s.activities);
const byId = (id: number) => activities.find((a) => a.id === id)!;

describe('playable', () => {
  it('plays the mp4 resource natively and the YouTube url by id', () => {
    expect(playable(byId(42))).toEqual({ kind: 'video', src: 'https://moodle.example/pluginfile.php/155/mod_resource/content/0/moodle-logo.mp4' });
    expect(playable(byId(43))).toEqual({ kind: 'youtube', id: 'aqz-KE-bpKQ' });
    expect(playable(byId(41))).toBeNull();
    expect(playable({ ...byId(42), media: { type: 'file', mimetype: 'application/pdf', src: 'x.pdf' } })).toBeNull();
  });
});

describe('youtubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=3', 'aqz-KE-bpKQ'],
    ['https://youtu.be/aqz-KE-bpKQ', 'aqz-KE-bpKQ'],
    ['https://www.youtube.com/embed/aqz-KE-bpKQ', 'aqz-KE-bpKQ'],
    ['https://www.youtube.com/shorts/aqz-KE-bpKQ', 'aqz-KE-bpKQ'],
    ['https://vimeo.com/1234', null],
    ['https://www.youtube.com/watch?v=bad', null],
    ['not a url', null],
  ])('%s -> %s', (link, id) => {
    expect(youtubeId(link)).toBe(id);
  });
});
