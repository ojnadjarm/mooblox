import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-hud-hub { position: absolute; z-index: 10; top: calc(max(12px, env(safe-area-inset-top)) + 62px); right: max(12px, env(safe-area-inset-right));
  height: 52px; padding: 0 16px 0 12px; box-sizing: border-box; border-radius: 999px; border: 4px solid #fff; background: #2fa39a; color: #fff;
  display: inline-flex; align-items: center; gap: 8px; font: 800 17px ${UI_FONT}; text-decoration: none; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-hud-hub svg { width: 26px; height: 26px; }
.mooblox-hud-hub:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
@media (max-width: 480px) { .mooblox-hud-hub { padding: 0 12px; } .mooblox-hud-hub span { display: none; } }
`;

const PORTAL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V10a7 7 0 0 1 14 0v11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`
  + `<ellipse cx="12" cy="13" rx="3.6" ry="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 21h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

export interface HubButtonStrings {
  readonly hub_back: string;
  readonly hub_back_label: string;
}

export const DEFAULT_HUB_BUTTON_STRINGS: HubButtonStrings = { hub_back: 'Hub', hub_back_label: 'Back to the hub of your worlds' };

/** Class of the HUD Hub link (the return portal plays its warp on a plain click). */
export const HUB_LINK_CLASS = 'mooblox-hud-hub';

/** HUD link from a course world back to the hub, under the avatar button. */
export function hubButton(host: HTMLElement, href: string, s: HubButtonStrings): HTMLAnchorElement {
  injectStyle('mooblox-hub-button-style', CSS);
  const a = document.createElement('a');
  a.className = HUB_LINK_CLASS;
  a.href = href;
  a.target = '_top';
  a.setAttribute('aria-label', s.hub_back_label);
  a.innerHTML = `${PORTAL}<span></span>`;
  a.querySelector('span')!.textContent = s.hub_back;
  host.appendChild(a);
  return a;
}
