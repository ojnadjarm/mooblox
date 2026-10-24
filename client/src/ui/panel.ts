import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-panel-backdrop { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; padding: 0;
  background: rgba(10, 30, 60, .45); }
.mooblox-panel-backdrop[hidden] { display: none; }
.mooblox-panel { display: flex; flex-direction: column; box-sizing: border-box; width: 100%; height: 100%; background: #fff;
  overflow: hidden; font: 700 16px/1.3 ${UI_FONT}; color: #2b2f3a; outline: none; }
.mooblox-panel-bar { display: flex; align-items: center; gap: 10px; flex: none; min-height: 56px; box-sizing: border-box;
  padding: 6px max(8px, env(safe-area-inset-right)) 6px max(16px, env(safe-area-inset-left)); background: #1e88e5; color: #fff; }
.mooblox-panel-title { flex: 1; min-width: 0; margin: 0; font: inherit; font-size: 20px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.mooblox-panel-actions { display: flex; gap: 8px; align-items: center; }
.mooblox-panel-close { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 3px solid #fff; background: #e23d2b;
  color: #fff; cursor: pointer; display: grid; place-items: center; padding: 0; }
.mooblox-panel-close:focus-visible, .mooblox-panel button:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-panel-close svg { width: 22px; height: 22px; }
.mooblox-panel-body { flex: 1; min-height: 0; position: relative; background: #f4f7fb; }
.mooblox-frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
@media (min-width: 769px) {
  .mooblox-panel-backdrop { padding: clamp(16px, 4vmin, 48px); }
  .mooblox-panel { max-width: 1280px; border-radius: 20px; border: 4px solid #fff; box-shadow: 0 12px 40px rgba(0, 30, 70, .4); }
}
`;

const FOCUSABLE = 'button:not([disabled]), [href], iframe, video, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Modal host over the canvas for a framed page or native content: focus trap, Esc and a close button. */
export class Panel {
  readonly element: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly title: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly body: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private done: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly host: HTMLElement) {
    injectStyle('mooblox-panel-style', CSS);
    this.element = document.createElement('div');
    this.element.className = 'mooblox-panel-backdrop';
    this.element.hidden = true;
    this.element.innerHTML = `
      <section class="mooblox-panel" role="dialog" aria-modal="true" aria-labelledby="mooblox-panel-title" tabindex="-1">
        <header class="mooblox-panel-bar">
          <h2 class="mooblox-panel-title" id="mooblox-panel-title"></h2>
          <div class="mooblox-panel-actions"></div>
          <button type="button" class="mooblox-panel-close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>
        <div class="mooblox-panel-body"></div>
      </section>`;
    host.appendChild(this.element);
    this.dialog = this.element.querySelector('.mooblox-panel')!;
    this.title = this.element.querySelector('.mooblox-panel-title')!;
    this.actions = this.element.querySelector('.mooblox-panel-actions')!;
    this.body = this.element.querySelector('.mooblox-panel-body')!;
    this.closeButton = this.element.querySelector('.mooblox-panel-close')!;
    this.closeButton.addEventListener('click', () => this.close());
    this.element.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.done !== null;
  }

  /** Shows `content` (and optional title-bar actions) until closed; resolves on close. */
  open(title: string, content: HTMLElement, actions: readonly HTMLElement[] = []): Promise<void> {
    this.close();
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.title.textContent = title;
    this.actions.replaceChildren(...actions);
    this.body.replaceChildren(content);
    for (const frame of content.matches('iframe') ? [content as HTMLIFrameElement] : [...content.querySelectorAll('iframe')]) {
      frame.addEventListener('load', () => this.watchFrame(frame));
    }
    this.setInert(true);
    this.element.hidden = false;
    this.closeButton.focus();
    return new Promise((resolve) => (this.done = resolve));
  }

  close(): void {
    const done = this.done;
    if (!done) {
      return;
    }
    this.done = null;
    this.element.hidden = true;
    this.body.replaceChildren();
    this.actions.replaceChildren();
    this.setInert(false);
    this.returnFocus?.focus?.();
    done();
  }

  /** Esc inside a same-origin framed page closes the panel too. */
  private watchFrame(frame: HTMLIFrameElement): void {
    try {
      frame.contentWindow?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.close();
        }
      });
    } catch {
      // A cross-origin frame keeps its own keys; the close button still works.
    }
  }

  private key(e: KeyboardEvent): void {
    if (e.key !== 'Tab') {
      return;
    }
    const items = [...this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) {
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private setInert(on: boolean): void {
    for (const child of this.host.children) {
      if (child !== this.element) {
        (child as HTMLElement).inert = on;
      }
    }
  }
}
