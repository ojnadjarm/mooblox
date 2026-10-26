import { injectStyle } from './style';

const CSS = `
.mooblox-white-out { position: fixed; z-index: 30; inset: 0; background: radial-gradient(circle, #fff 0%, #fff 55%, #dff8ff 100%);
  pointer-events: none; }
`;

/** The warp's full-screen white flash over a course world (0 = clear, 1 = white). */
export class WhiteOut {
  readonly element: HTMLElement;

  constructor(host: HTMLElement, start = 0) {
    injectStyle('mooblox-white-out-style', CSS);
    this.element = document.createElement('div');
    this.element.className = 'mooblox-white-out';
    this.element.setAttribute('aria-hidden', 'true');
    host.appendChild(this.element);
    this.set(start);
  }

  set(v: number): void {
    this.element.style.opacity = String(v);
    this.element.hidden = v <= 0.001;
  }
}
