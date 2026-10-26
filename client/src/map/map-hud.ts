import { injectStyle, UI_FONT } from '../ui/style';
import type { MapStrings } from './map-strings';

const CSS = `
.mooblox-map-title { position: absolute; z-index: 10; top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left)); margin: 0;
  height: 52px; padding: 0 18px 0 12px; box-sizing: border-box; border-radius: 999px; border: 4px solid #fff; background: #1e88e5; color: #fff;
  display: inline-flex; align-items: center; gap: 8px; font: 800 18px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-map-title svg { width: 26px; height: 26px; flex: none; }
.mooblox-map-hint { position: absolute; z-index: 10; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%); max-width: calc(100% - 24px);
  box-sizing: border-box; padding: 10px 20px; border-radius: 999px; background: rgba(255, 255, 255, .92); color: #23304a; font: 800 16px ${UI_FONT};
  text-align: center; box-shadow: 0 4px 14px rgba(0, 40, 80, .25); pointer-events: none; }
.mooblox-map-hint[hidden], .mooblox-map-empty[hidden] { display: none; }
.mooblox-map-empty { position: absolute; z-index: 20; left: 50%; top: 50%; transform: translate(-50%, -50%); box-sizing: border-box; width: min(460px, calc(100% - 24px));
  padding: clamp(20px, 4vw, 32px); border-radius: 24px; background: #fff; border: 4px solid #2f7fe0; box-shadow: 0 10px 0 rgba(47, 127, 224, .25);
  text-align: center; color: #23304a; font-family: ${UI_FONT}; }
.mooblox-map-empty h2 { margin: 0 0 10px; font: 800 clamp(22px, 3vw, 28px)/1.2 ${UI_FONT}; }
.mooblox-map-empty p { margin: 0; font: 600 clamp(16px, 1.6vw, 18px)/1.45 ${UI_FONT}; }
.mooblox-map-root .mooblox-sound { left: auto; right: max(12px, env(safe-area-inset-right)); transform: none; display: flex; flex-direction: column; align-items: flex-end; }
@media (max-width: 480px) { .mooblox-map-title { font-size: 16px; } .mooblox-map-hint { font-size: 15px; } }
`;

const GLOBE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/>`
  + `<path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

/** The map's fixed texts: title, the "pick an island" hint and the empty state. */
export class MapHud {
  readonly hint: HTMLElement;

  constructor(host: HTMLElement, s: MapStrings, empty: boolean) {
    injectStyle('mooblox-map-hud-style', CSS);
    const title = document.createElement('div');
    title.className = 'mooblox-map-title';
    title.innerHTML = `${GLOBE}<span></span>`;
    title.querySelector('span')!.textContent = s.map_title;
    this.hint = document.createElement('div');
    this.hint.className = 'mooblox-map-hint';
    this.hint.textContent = s.map_hint;
    this.hint.hidden = empty;
    host.append(title, this.hint);
    if (empty) {
      const card = document.createElement('section');
      card.className = 'mooblox-map-empty';
      card.setAttribute('role', 'status');
      const h = document.createElement('h2');
      h.textContent = s.map_empty_title;
      const p = document.createElement('p');
      p.textContent = s.map_empty_text;
      card.append(h, p);
      host.appendChild(card);
    }
  }
}
