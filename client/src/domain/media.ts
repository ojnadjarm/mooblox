import type { Activity } from './types';

/** How an activity plays in the world's own player, when it can. */
export type Playable = { readonly kind: 'video'; readonly src: string } | { readonly kind: 'youtube'; readonly id: string };

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);
const YOUTUBE_ID = /^[\w-]{11}$/;

/** A video file of a resource or a YouTube link of a URL; null for anything else. */
export function playable(a: Activity): Playable | null {
  const m = a.media;
  if (m?.type === 'file' && m.mimetype.startsWith('video/')) {
    return { kind: 'video', src: m.src };
  }
  if (m?.type === 'link') {
    const id = youtubeId(m.src);
    return id ? { kind: 'youtube', id } : null;
  }
  return null;
}

/** The video id of a YouTube watch, short, embed or youtu.be link. */
export function youtubeId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    return null;
  }
  const path = url.pathname.split('/').filter(Boolean);
  const id = url.hostname === 'youtu.be' ? path[0] : url.searchParams.get('v') ?? (['embed', 'shorts', 'live'].includes(path[0] ?? '') ? path[1] : undefined);
  return id && YOUTUBE_ID.test(id) ? id : null;
}
