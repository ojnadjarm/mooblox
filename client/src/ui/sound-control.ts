import type { SoundSettings } from '../audio/settings';
import { injectStyle, UI_FONT } from './style';

export interface SoundControlStrings {
  readonly sound: string;
  readonly sound_on: string;
  readonly sound_off: string;
  readonly sound_volume: string;
}

export const DEFAULT_SOUND_STRINGS: SoundControlStrings = { sound: 'Sound', sound_on: 'Sound on', sound_off: 'Sound off', sound_volume: 'Volume' };

const CSS = `
.mooblox-sound { position: absolute; z-index: 10; top: max(12px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; font: 800 16px ${UI_FONT}; }
.mooblox-sound-button { width: 52px; height: 52px; border-radius: 50%; border: 4px solid #fff; background: #00897b; color: #fff; cursor: pointer;
  display: grid; place-items: center; padding: 0; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-sound-button[aria-pressed="false"] { background: #78909c; }
.mooblox-sound-button svg { width: 26px; height: 26px; }
.mooblox-sound-pop { margin-top: 8px; box-sizing: border-box; width: min(260px, calc(100vw - 24px)); padding: 12px 14px; border-radius: 18px;
  background: #fff; color: #263238; box-shadow: 0 6px 20px rgba(0, 40, 80, .3); display: grid; gap: 10px; }
.mooblox-sound-pop[hidden] { display: none; }
.mooblox-sound-toggle { min-height: 44px; border-radius: 999px; border: 0; background: #00897b; color: #fff; font: inherit; cursor: pointer; }
.mooblox-sound-toggle[aria-pressed="false"] { background: #78909c; }
.mooblox-sound-pop label { display: grid; gap: 4px; font-size: 14px; color: #5a5f6e; }
.mooblox-sound-pop input { width: 100%; min-height: 32px; margin: 0; accent-color: #00897b; }
@media (max-width: 480px) { .mooblox-sound-button { width: 44px; height: 44px; margin-top: 4px; border-width: 3px; } .mooblox-sound-button svg { width: 22px; height: 22px; } }
.mooblox-sound button:focus-visible, .mooblox-sound input:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
`;

const ON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const OFF = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

/** The HUD sound button (top middle): a tap opens a card with Sound on/off and a volume slider; M toggles the sound. */
export class SoundControl {
  readonly element: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly pop: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly slider: HTMLInputElement;

  constructor(
    host: HTMLElement,
    private settings: SoundSettings,
    private readonly strings: SoundControlStrings,
    private readonly changed: (s: SoundSettings) => void,
  ) {
    injectStyle('mooblox-sound-style', CSS);
    this.element = document.createElement('div');
    this.element.className = 'mooblox-sound';
    this.element.innerHTML = `<button type="button" class="mooblox-sound-button" aria-expanded="false" aria-controls="mooblox-sound-pop"></button>
      <div class="mooblox-sound-pop" id="mooblox-sound-pop" hidden><button type="button" class="mooblox-sound-toggle"></button>
      <label><span></span><input type="range" min="0" max="100" step="5"></label></div>`;
    this.button = this.element.querySelector('.mooblox-sound-button')!;
    this.pop = this.element.querySelector('.mooblox-sound-pop')!;
    this.toggle = this.element.querySelector('.mooblox-sound-toggle')!;
    this.slider = this.element.querySelector('input')!;
    this.element.querySelector('label span')!.textContent = strings.sound_volume;
    this.button.addEventListener('click', () => this.show(Boolean(this.pop.hidden)));
    this.toggle.addEventListener('click', () => this.set({ ...this.settings, on: !this.settings.on }));
    this.slider.addEventListener('input', () => this.set({ on: true, volume: Number(this.slider.value) / 100 }));
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.pop.hidden) {
        e.stopPropagation();
        this.show(false);
        this.button.focus();
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.pop.hidden && !this.element.contains(e.target as Node)) this.show(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        this.set({ ...this.settings, on: !this.settings.on });
      }
    });
    host.appendChild(this.element);
    this.render();
  }

  private show(open: boolean): void {
    this.pop.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
  }

  private set(next: SoundSettings): void {
    this.settings = next;
    this.render();
    this.changed(next);
  }

  private render(): void {
    const { on, volume } = this.settings;
    this.button.innerHTML = on ? ON : OFF;
    this.button.setAttribute('aria-pressed', String(on));
    this.button.setAttribute('aria-label', `${this.strings.sound}: ${on ? this.strings.sound_on : this.strings.sound_off}`);
    this.toggle.textContent = on ? this.strings.sound_on : this.strings.sound_off;
    this.toggle.setAttribute('aria-pressed', String(on));
    this.slider.value = String(Math.round(volume * 100));
  }
}
