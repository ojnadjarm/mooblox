import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-collect-toast { position: absolute; z-index: 12; left: 50%; top: max(14px, env(safe-area-inset-top)); transform: translate(-50%, -8px);
  max-width: calc(100% - 24px); box-sizing: border-box; padding: 8px 18px 9px 10px; border-radius: 999px; border: 4px solid #fff;
  background: rgba(255, 252, 244, .96); color: #2b2f3a; font: 800 16px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3);
  display: flex; align-items: center; gap: 8px; white-space: nowrap; pointer-events: none; opacity: 0;
  transition: opacity .25s, transform .25s cubic-bezier(.2, .8, .2, 1); }
.mooblox-collect-toast.is-on { opacity: 1; transform: translate(-50%, 0); }
.mooblox-collect-toast i { width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center; font-style: normal; }
.mooblox-collect-toast b { color: #6a3fb0; }
.mooblox-collect-toast span { overflow: hidden; text-overflow: ellipsis; }
@media (prefers-reduced-motion: reduce) { .mooblox-collect-toast { transition: none; } }
`;

const ICON: Record<string, [string, string]> = { gem: ['#a774f0', '&#9670;'], crystal: ['#1fa4c9', '&#9650;'], star: ['#f6c445', '&#9733;'] };
const SHOW_MS = 2600;

/** A short top-centre pill after a pick-up: "Gem found! 4 of 13 found". */
export class CollectToast {
  readonly element: HTMLElement;
  private timer = 0;

  constructor(host: HTMLElement) {
    injectStyle('mooblox-collect-toast-style', CSS);
    this.element = document.createElement('div');
    this.element.className = 'mooblox-collect-toast';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    host.appendChild(this.element);
  }

  show(kind: string, title: string, count: string): void {
    const [bg, glyph] = ICON[kind] ?? ICON['gem']!;
    this.element.replaceChildren();
    const icon = document.createElement('i');
    icon.style.background = bg;
    icon.style.color = '#fff';
    icon.innerHTML = glyph;
    const b = document.createElement('b');
    b.textContent = title;
    const span = document.createElement('span');
    span.textContent = count;
    this.element.append(icon, b, span);
    this.element.classList.add('is-on');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.element.classList.remove('is-on'), SHOW_MS);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.element.remove();
  }
}
