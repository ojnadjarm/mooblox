import { playable } from '../domain/media';
import type { Activity } from '../domain/types';
import type { MoodleGateway } from '../moodle/gateway';
import type { PanelHost } from '../ui/panel';
import { injectStyle } from '../ui/style';
import type { ActivityOpener } from './opener';

const CSS = `.mooblox-video { display: block; width: 100%; height: 100%; border: 0; background: #000; object-fit: contain; }`;

/** Plays a video resource in a native player and a YouTube link in the privacy-enhanced embed; marks it viewed. */
export class VideoOpener implements ActivityOpener {
  constructor(
    private readonly gateway: MoodleGateway,
    private readonly onError: (e: unknown) => void = (e) => console.error('mooblox: view_activity failed', e),
  ) {}

  canOpen(a: Activity): boolean {
    return a.available && playable(a) !== null;
  }

  open(a: Activity, panel: PanelHost): Promise<void> {
    injectStyle('mooblox-video-style', CSS);
    const media = playable(a)!;
    let element: HTMLElement;
    if (media.kind === 'video') {
      const video = document.createElement('video');
      video.src = media.src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      element = video;
    } else {
      const frame = document.createElement('iframe');
      frame.src = youtubeEmbed(media.id);
      frame.title = a.name;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      element = frame;
    }
    element.className = 'mooblox-video';
    this.gateway.viewActivity(a.id).catch(this.onError);
    return panel.open(a.name, element);
  }
}

/** The youtube-nocookie embed URL of a video id. */
export function youtubeEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}
