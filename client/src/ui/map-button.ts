import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-hud-map { position: absolute; z-index: 10; top: calc(max(12px, env(safe-area-inset-top)) + 62px); right: max(12px, env(safe-area-inset-right));
  height: 52px; padding: 0 16px 0 12px; box-sizing: border-box; border-radius: 999px; border: 4px solid #fff; background: #2fa39a; color: #fff;
  display: inline-flex; align-items: center; gap: 8px; font: 800 17px ${UI_FONT}; text-decoration: none; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-hud-map svg { width: 26px; height: 26px; }
.mooblox-hud-map:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
@media (max-width: 480px) { .mooblox-hud-map { padding: 0 12px; } .mooblox-hud-map span { display: none; } }
`;

const MAP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`
  + `<path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="2"/></svg>`;

export interface MapButtonStrings {
  readonly map_back: string;
  readonly map_back_label: string;
}

export const DEFAULT_MAP_BUTTON_STRINGS: MapButtonStrings = { map_back: 'Map', map_back_label: 'Back to the map of your worlds' };

/** HUD link from a course world back to the course map, under the avatar button. */
export function mapButton(host: HTMLElement, href: string, s: MapButtonStrings): HTMLAnchorElement {
  injectStyle('mooblox-map-button-style', CSS);
  const a = document.createElement('a');
  a.className = 'mooblox-hud-map';
  a.href = href;
  a.target = '_top';
  a.setAttribute('aria-label', s.map_back_label);
  a.innerHTML = `${MAP}<span></span>`;
  a.querySelector('span')!.textContent = s.map_back;
  host.appendChild(a);
  return a;
}
