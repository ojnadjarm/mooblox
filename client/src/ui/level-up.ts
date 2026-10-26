import type { LevelUp } from '../rewards/level-up';
import { itemName } from '../rewards/item-names';
import { playChime } from './chime';
import { confetti } from './confetti';
import { fill } from './hud-model';
import { injectStyle, UI_FONT } from './style';

/** Level-up texts; `{level}` and `{item}` are filled in. */
export interface LevelUpStrings {
  readonly levelup_title: string;
  readonly levelup_unlocked: string;
  readonly levelup_tryon: string;
  readonly levelup_skip: string;
}

export const DEFAULT_LEVELUP_STRINGS: LevelUpStrings = {
  levelup_title: 'Level {level}!',
  levelup_unlocked: 'You unlocked: {item}',
  levelup_tryon: 'Try it on',
  levelup_skip: 'Tap or press any key to go on',
};

const CONFETTI_MS = 2500;
const SHOW_MS = 6000;

const CSS = `
.mooblox-levelup { position: absolute; inset: 0; z-index: 25; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
  background: radial-gradient(circle at 50% 45%, rgba(255, 246, 214, .55), rgba(43, 47, 58, .25) 70%); font-family: ${UI_FONT}; }
.mooblox-levelup canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.mooblox-levelup-card { position: relative; box-sizing: border-box; width: min(360px, 100%); padding: 56px 22px 20px; border-radius: 28px;
  border: 5px solid #fff; background: #fffaf0; color: #2b2f3a; text-align: center; box-shadow: 0 10px 0 #d2bc9a, 0 18px 40px rgba(43, 47, 58, .35);
  animation: mooblox-levelup-pop .45s cubic-bezier(.2, 1.6, .4, 1) both; }
.mooblox-levelup-badge { position: absolute; left: 50%; top: -46px; width: 96px; height: 96px; transform: translateX(-50%);
  display: grid; place-items: center; color: #fff; font: 900 36px ${UI_FONT}; }
.mooblox-levelup-badge svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.mooblox-levelup-badge span { position: relative; margin-top: 6px; text-shadow: 0 3px 0 #b4583a, 0 0 6px rgba(180, 88, 58, .6); }
.mooblox-levelup-title { margin: 0; font: 900 32px ${UI_FONT}; color: #1f7a78; }
.mooblox-levelup-item { margin: 8px 0 0; font: 800 18px ${UI_FONT}; }
.mooblox-levelup-try { margin-top: 16px; min-height: 48px; padding: 0 24px; border: 0; border-radius: 999px; background: #2fa39a;
  box-shadow: inset 0 -5px 0 #1f7a78; color: #fff; font: 900 18px ${UI_FONT}; cursor: pointer; }
.mooblox-levelup-try:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-levelup-skip { margin: 14px 0 0; font: 700 13px ${UI_FONT}; color: #6b6f7c; }
@keyframes mooblox-levelup-pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
.mooblox-levelup.is-calm .mooblox-levelup-card { animation: none; }
@media (min-width: 1800px) { .mooblox-levelup-card { width: 420px; } .mooblox-levelup-title { font-size: 38px; } }
`;

const STAR =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4l13 26 29 4-21 20 5 29-26-14-26 14 5-29L8 34l29-4z" fill="#d49a2a" transform="translate(0 4)"/><path d="M50 4l13 26 29 4-21 20 5 29-26-14-26 14 5-29L8 34l29-4z" fill="#f6c445" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>';

/** What the moment needs from outside. */
export interface LevelUpOptions {
  readonly strings?: Partial<LevelUpStrings> & Readonly<Record<string, string>>;
  /** Opens the wardrobe; without it there is no "Try it on" button. */
  readonly tryOn?: (() => void) | undefined;
  readonly chime?: boolean;
  readonly reducedMotion?: () => boolean;
}

/** The level-up moment: confetti for 2.5 s, a chime and a card naming the unlock; any key or tap skips it. */
export class LevelUpMoment {
  private element: HTMLElement | null = null;
  private timers: number[] = [];
  private stopConfetti: (() => void) | null = null;
  private readonly strings: LevelUpStrings & Readonly<Record<string, string>>;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') this.close();
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly options: LevelUpOptions = {},
  ) {
    injectStyle('mooblox-levelup-style', CSS);
    this.strings = { ...DEFAULT_LEVELUP_STRINGS, ...options.strings };
  }

  get isOpen(): boolean {
    return this.element !== null;
  }

  /** Shows the moment for `up`, replacing one still on screen. */
  play(up: LevelUp): void {
    this.close();
    const calm = this.options.reducedMotion?.() ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = this.strings;
    const el = document.createElement('div');
    el.className = `mooblox-levelup${calm ? ' is-calm' : ''}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const item = up.items[0];
    el.innerHTML = `<div class="mooblox-levelup-card"><div class="mooblox-levelup-badge">${STAR}<span></span></div>
      <h2 class="mooblox-levelup-title"></h2><p class="mooblox-levelup-item"></p><p class="mooblox-levelup-skip"></p></div>`;
    el.querySelector('.mooblox-levelup-badge span')!.textContent = String(up.level);
    el.querySelector('.mooblox-levelup-title')!.textContent = fill(s.levelup_title, { level: up.level });
    const line = el.querySelector<HTMLElement>('.mooblox-levelup-item')!;
    line.textContent = item ? fill(s.levelup_unlocked, { item: itemName(item, s) }) : '';
    line.hidden = !item;
    el.querySelector('.mooblox-levelup-skip')!.textContent = s.levelup_skip;
    if (item && this.options.tryOn) {
      const tryOn = this.options.tryOn;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mooblox-levelup-try';
      b.textContent = s.levelup_tryon;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        tryOn();
      });
      line.after(b);
    }
    el.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('.mooblox-levelup-try')) this.close();
    });
    this.host.appendChild(el);
    this.element = el;
    window.addEventListener('keydown', this.onKey, true);
    if (!calm) this.stopConfetti = confetti(el, CONFETTI_MS);
    if (this.options.chime ?? true) playChime();
    this.timers.push(window.setTimeout(() => this.close(), SHOW_MS));
  }

  /** Ends the moment at once. */
  close(): void {
    if (!this.element) {
      return;
    }
    this.element.remove();
    this.element = null;
    this.stopConfetti?.();
    this.stopConfetti = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    window.removeEventListener('keydown', this.onKey, true);
  }
}
