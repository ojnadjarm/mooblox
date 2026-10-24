import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { toWorld } from '../../src/domain/mapper';
import { createOpenerRegistry } from '../../src/interaction/catalog';
import { FrameOpener } from '../../src/interaction/frame-opener';
import { VideoOpener, youtubeEmbed } from '../../src/interaction/video-opener';
import { FakeGateway } from '../../src/moodle/fake-gateway';

const activities = toWorld(fixture).sections.flatMap((s) => s.activities);
const byId = (id: number) => activities.find((a) => a.id === id)!;

describe('createOpenerRegistry', () => {
  it('frames any available activity with a page; labels and locked ones open nothing', () => {
    const registry = createOpenerRegistry(new FakeGateway(fixture));
    expect(registry.resolve(byId(44))).toBeInstanceOf(FrameOpener);
    expect(registry.resolve(byId(40))).toBeNull();
    expect(registry.resolve({ ...byId(44), available: false })).toBeNull();
  });

  it('plays the mp4 resource and the YouTube url in the video opener, nocookie embed', () => {
    const registry = createOpenerRegistry(new FakeGateway(fixture));
    expect(registry.resolve(byId(42))).toBeInstanceOf(VideoOpener);
    expect(registry.resolve(byId(43))).toBeInstanceOf(VideoOpener);
    expect(youtubeEmbed('aqz-KE-bpKQ')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?/);
  });
});
