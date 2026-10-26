import lockupUrl from './brand/lockup.svg?url';
import { injectStyle } from './style';

const CSS = `
.mooblox-brand-mark { position: absolute; z-index: 10; left: max(14px, env(safe-area-inset-left)); bottom: max(12px, env(safe-area-inset-bottom));
  height: 30px; width: auto; opacity: .92; pointer-events: none; user-select: none; }
@media (pointer: coarse), (max-width: 767px) { .mooblox-brand-mark { display: none; } }
`;

/** The small Mooblox lockup in the bottom-left HUD corner (mouse screens 768 px and wider; touch keeps the corner for the stick). */
export function brandMark(host: HTMLElement): HTMLImageElement {
  injectStyle('mooblox-brand-mark-style', CSS);
  const img = document.createElement('img');
  img.className = 'mooblox-brand-mark';
  img.src = lockupUrl;
  img.alt = '';
  host.append(img);
  return img;
}
