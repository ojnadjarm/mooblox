import type { LookMode } from '../player/look-mode';
import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-look-tip { position: absolute; z-index: 9; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom));
  box-sizing: border-box; max-width: min(320px, calc(100vw - 24px)); padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.88);
  box-shadow: 0 3px 10px rgba(0, 40, 80, .2); font: 700 14px/1.3 ${UI_FONT}; color: #2b2f3a; pointer-events: none; }
.mooblox-look-tip[hidden] { display: none; }
.mooblox-look-tip kbd { display: inline-block; min-width: 1.6em; padding: 0 6px; margin: 0 2px; border-radius: 6px; background: #2b2f3a;
  color: #fff; font: inherit; font-size: 12px; text-align: center; }
@media (max-width: 1000px) { .mooblox-look-tip { right: auto; left: 50%; transform: translateX(-50%); width: max-content; }
  .mooblox-look-tip:not([hidden]) ~ .mooblox-prompt { --mooblox-prompt-lift: 44px; } }
`;

/** Tip texts per mouse-look mode; `{ctrl}` becomes the key cap. */
export interface LookTipStrings {
  readonly look_click: string;
  readonly look_ctrl: string;
  readonly look_release: string;
}

export const DEFAULT_LOOK_TIP_STRINGS: LookTipStrings = {
  look_click: 'Click to look around with the mouse',
  look_ctrl: 'Hold {ctrl} to use the mouse',
  look_release: 'Let go of {ctrl} to look around',
};

/** A small corner tip saying how the PC mouse works right now; hidden while a panel is open. */
export class LookTip {
  readonly root: HTMLElement;

  constructor(host: HTMLElement, private readonly strings: LookTipStrings) {
    injectStyle('mooblox-look-tip-style', CSS);
    this.root = document.createElement('div');
    this.root.className = 'mooblox-look-tip';
    this.root.setAttribute('aria-live', 'polite');
    host.appendChild(this.root);
  }

  show(mode: LookMode): void {
    const text = mode === 'off' ? this.strings.look_click : mode === 'locked' ? this.strings.look_ctrl : mode === 'free' ? this.strings.look_release : '';
    this.root.hidden = text === '';
    const [before, after] = text.split('{ctrl}');
    const kbd = document.createElement('kbd');
    kbd.textContent = 'Ctrl';
    this.root.replaceChildren(before ?? '', ...(after === undefined ? [] : [kbd, after]));
  }
}
