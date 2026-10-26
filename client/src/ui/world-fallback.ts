import { injectStyle, UI_FONT } from './style';

/** Texts of the card shown when the 3D world cannot be drawn. */
export interface FallbackStrings {
  readonly fallback_title: string;
  readonly fallback_text: string;
  readonly fallback_link: string;
  readonly fallback_retry: string;
}

export const DEFAULT_FALLBACK_STRINGS: FallbackStrings = {
  fallback_title: 'Oops! The world cannot open here',
  fallback_text: 'This device or browser cannot show the 3D world right now. You can still do all your activities on the course page.',
  fallback_link: 'Go to the course page',
  fallback_retry: 'Try again',
};

/** The fallback texts from the play config strings, defaults for missing keys. */
export function fallbackStrings(strings: Readonly<Record<string, string>>): FallbackStrings {
  const s = { ...DEFAULT_FALLBACK_STRINGS };
  for (const key of Object.keys(s) as (keyof FallbackStrings)[]) {
    if (strings[key]) s[key] = strings[key];
  }
  return s;
}

/** The normal Moodle course page. */
export function courseUrl(wwwroot: string, courseId: number): string {
  return `${wwwroot}/course/view.php?id=${courseId}`;
}

const CSS = `
.mooblox-fallback { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
  overflow-y: auto; background: linear-gradient(180deg, #bfe3ff 0%, #e8f6ff 60%, #d8f0c8 100%); font-family: ${UI_FONT}; }
.mooblox-fallback-card { width: 100%; max-width: 520px; box-sizing: border-box; padding: clamp(20px, 4vw, 36px); border-radius: 24px;
  background: #fff; border: 4px solid #2f7fe0; box-shadow: 0 10px 0 rgba(47, 127, 224, .25); text-align: center; color: #23304a; }
.mooblox-fallback-card h1 { margin: 0 0 12px; font: 800 clamp(22px, 3vw, 30px)/1.2 ${UI_FONT}; }
.mooblox-fallback-card p { margin: 0 0 22px; font: 600 clamp(16px, 1.6vw, 19px)/1.45 ${UI_FONT}; }
.mooblox-fallback-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
.mooblox-fallback-actions a, .mooblox-fallback-actions button { min-height: 48px; padding: 0 22px; border-radius: 999px; display: inline-flex;
  align-items: center; justify-content: center; font: 800 17px ${UI_FONT}; cursor: pointer; text-decoration: none; box-sizing: border-box; }
.mooblox-fallback-actions a { background: #2f7fe0; color: #fff; border: 3px solid #2f7fe0; }
.mooblox-fallback-actions button { background: #fff; color: #2f7fe0; border: 3px solid #2f7fe0; }
`;

/** Shows the kid-friendly "the world cannot open" card over `host`, linking to `href`; `remove()` on it hides it again. */
export function showFallback(host: HTMLElement, href: string, s: FallbackStrings): HTMLElement {
  injectStyle('mooblox-fallback-style', CSS);
  const box = document.createElement('div');
  box.className = 'mooblox-fallback';
  box.setAttribute('role', 'alert');
  const card = document.createElement('div');
  card.className = 'mooblox-fallback-card';
  const title = document.createElement('h1');
  title.textContent = s.fallback_title;
  const text = document.createElement('p');
  text.textContent = s.fallback_text;
  const actions = document.createElement('div');
  actions.className = 'mooblox-fallback-actions';
  const link = document.createElement('a');
  link.href = href;
  link.target = '_top';
  link.textContent = s.fallback_link;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = s.fallback_retry;
  retry.addEventListener('click', () => location.reload());
  actions.append(link, retry);
  card.append(title, text, actions);
  box.append(card);
  host.append(box);
  return box;
}
