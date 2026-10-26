import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-prompt { position: absolute; left: 50%; transform: translateX(-50%); z-index: 10;
  bottom: calc(max(16px, env(safe-area-inset-bottom)) + var(--mooblox-prompt-lift, 0px));
  display: flex; align-items: center; gap: 12px; box-sizing: border-box; max-width: min(560px, calc(100% - 32px));
  padding: 10px 12px 10px 18px; border-radius: 999px; background: #fff; border: 4px solid #1e88e5;
  box-shadow: 0 6px 18px rgba(0, 40, 80, .3); font: 700 17px/1.25 ${UI_FONT}; color: #2b2f3a; }
.mooblox-prompt[hidden] { display: none; }
.mooblox-prompt:not([hidden]) { animation: mooblox-prompt-pop .3s cubic-bezier(.3, 1.6, .5, 1) both; }
@keyframes mooblox-prompt-pop { from { opacity: 0; transform: translateX(-50%) translateY(14px) scale(.7); }
  to { opacity: 1; transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .mooblox-prompt:not([hidden]) { animation: none; } }
.mooblox-prompt.locked { border-color: #6e6d72; }
.mooblox-prompt-text { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.mooblox-prompt-go { flex: none; min-height: 44px; padding: 0 18px; border-radius: 999px; border: 0; background: #1e88e5; color: #fff;
  font: 800 17px ${UI_FONT}; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.mooblox-prompt-go:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-prompt-go kbd { font: inherit; background: rgba(255, 255, 255, .25); border-radius: 6px; padding: 0 7px; }
.mooblox-prompt-go[hidden] { display: none; }
@media (pointer: coarse) { .mooblox-prompt-go kbd { display: none; }
  .mooblox-prompt { --mooblox-prompt-lift: calc(clamp(110px, 26vmin, 180px) + 12px); } }
`;

/** What the prompt says about the activity the player stands at. */
export interface PromptContent {
  readonly name: string;
  /** Why it is locked, or null when it is open. */
  readonly locked: string | null;
  readonly openable: boolean;
}

/** Pill above the bottom edge: the activity's name and an Open button (key E or tap). */
export class ActivityPrompt {
  readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private readonly go: HTMLButtonElement;

  constructor(host: HTMLElement, onOpen: () => void, label = 'Open') {
    injectStyle('mooblox-prompt-style', CSS);
    this.element = document.createElement('div');
    this.element.className = 'mooblox-prompt';
    this.element.hidden = true;
    this.element.setAttribute('role', 'status');
    this.element.innerHTML = `<span class="mooblox-prompt-text"></span>
      <button type="button" class="mooblox-prompt-go"><kbd>E</kbd><span>Open</span></button>`;
    host.appendChild(this.element);
    this.text = this.element.querySelector('.mooblox-prompt-text')!;
    this.go = this.element.querySelector('.mooblox-prompt-go')!;
    this.go.querySelector('span')!.textContent = label;
    this.go.addEventListener('click', onOpen);
  }

  show(content: PromptContent | null): void {
    this.element.hidden = content === null;
    if (!content) {
      return;
    }
    this.element.classList.toggle('locked', content.locked !== null);
    this.text.textContent = content.locked !== null ? `Locked: ${content.name}. ${content.locked}` : content.name;
    this.go.hidden = !content.openable;
  }
}
