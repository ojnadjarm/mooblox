import type { Trophy } from '../domain/rewards';
import { confetti } from './confetti';
import { fill } from './hud-model';
import { injectStyle, UI_FONT } from './style';

/** Badge moment texts; `{badge}` is filled in. */
export interface BadgeMomentStrings {
  readonly badge_earned: string;
  readonly levelup_skip: string;
}

export const DEFAULT_BADGE_STRINGS: BadgeMomentStrings = {
  badge_earned: 'You earned {badge}!',
  levelup_skip: 'Tap or press any key to go on',
};

const CONFETTI_MS = 2800;
const SHOW_MS = 6500;
/** A card stays at least this long (ms): a key already held or a click in flight does not skip it unseen. */
const HOLD_MS = 1000;

const CSS = `
.mooblox-badge-moment { position: absolute; inset: 0; z-index: 26; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
  background: radial-gradient(circle at 50% 45%, rgba(255, 238, 190, .6), rgba(43, 47, 58, .3) 70%); font-family: ${UI_FONT}; overflow: hidden; }
.mooblox-badge-moment canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.mooblox-badge-card { position: relative; box-sizing: border-box; width: min(380px, 100%); padding: 150px 22px 20px; border-radius: 28px;
  border: 5px solid #fff; background: #fffaf0; color: #2b2f3a; text-align: center; box-shadow: 0 10px 0 #d2bc9a, 0 18px 40px rgba(43, 47, 58, .35);
  margin-top: 70px; animation: mooblox-badge-pop .5s cubic-bezier(.2, 1.6, .4, 1) both; }
.mooblox-badge-cup { position: absolute; left: 50%; top: -96px; width: 200px; height: 230px; transform: translateX(-50%); }
.mooblox-badge-rays { position: absolute; left: 50%; top: 42%; width: 340px; height: 340px; margin: -170px 0 0 -170px; border-radius: 50%;
  background: repeating-conic-gradient(rgba(246, 196, 69, .55) 0 10deg, rgba(246, 196, 69, 0) 10deg 22.5deg);
  -webkit-mask: radial-gradient(circle, #000 30%, transparent 70%); mask: radial-gradient(circle, #000 30%, transparent 70%);
  animation: mooblox-badge-spin 9s linear infinite; }
.mooblox-badge-cup svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.mooblox-badge-cup img { position: absolute; left: 50%; top: 52px; width: 92px; height: 92px; margin-left: -46px; border-radius: 50%;
  border: 6px solid #fff6dc; box-sizing: border-box; background: #fff; object-fit: cover; box-shadow: 0 0 0 4px #c98a1e; }
.mooblox-badge-cup::after { content: ''; position: absolute; left: 30%; top: 34px; width: 22px; height: 120px; border-radius: 12px;
  background: linear-gradient(rgba(255, 255, 255, .85), rgba(255, 255, 255, 0)); transform: rotate(14deg); opacity: 0;
  animation: mooblox-badge-glint 2.6s ease-in-out .5s infinite; }
.mooblox-badge-title { margin: 0; font: 900 28px ${UI_FONT}; color: #1f7a78; overflow-wrap: anywhere; }
.mooblox-badge-skip { margin: 14px 0 0; font: 700 13px ${UI_FONT}; color: #6b6f7c; }
@keyframes mooblox-badge-pop { from { transform: scale(.4) translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes mooblox-badge-spin { to { transform: rotate(360deg); } }
@keyframes mooblox-badge-glint { 0%, 55% { opacity: 0; transform: translateX(-30px) rotate(14deg); } 70% { opacity: 1; } 100% { opacity: 0; transform: translateX(70px) rotate(14deg); } }
.mooblox-badge-moment.is-calm .mooblox-badge-card, .mooblox-badge-moment.is-calm .mooblox-badge-rays, .mooblox-badge-moment.is-calm .mooblox-badge-cup::after { animation: none; }
@media (max-height: 520px) { .mooblox-badge-card { margin-top: 40px; padding-top: 110px; } .mooblox-badge-cup { transform: translateX(-50%) scale(.75); transform-origin: 50% 0; } }
@media (min-width: 1800px) { .mooblox-badge-card { width: 440px; } .mooblox-badge-title { font-size: 34px; } }
`;

/** A gold two-handled cup on a stepped foot (the badge image sits on its bowl). */
const CUP =
  '<svg viewBox="0 0 200 230" aria-hidden="true"><g stroke="#fff" stroke-width="5" stroke-linejoin="round">' +
  '<path d="M44 52c-30 0-34 54 6 64M156 52c30 0 34 54-6 64" fill="none" stroke="#c98a1e" stroke-width="13" stroke-linecap="round"/>' +
  '<path d="M40 30h120c0 70-18 108-60 112C58 138 40 100 40 30z" fill="#f6c445"/>' +
  '<path d="M88 142h24l6 34H82z" fill="#d9a032"/><path d="M58 176h84v18H58z" fill="#c98a1e"/><path d="M46 194h108v22H46z" fill="#f6c445"/>' +
  '</g><path d="M40 30h120" stroke="#fff6dc" stroke-width="8" stroke-linecap="round"/></svg>';

/** What the moment needs from outside. */
export interface BadgeMomentOptions {
  readonly strings?: Partial<BadgeMomentStrings> & Readonly<Record<string, string>>;
  readonly reducedMotion?: () => boolean;
}

/** "You earned <badge>!": a gold cup carrying the badge image, rays and confetti; badges queue; any key or tap goes on. */
export class BadgeMoment {
  /** Called as each badge's card shows (the fanfare). */
  onShow: ((badge: Trophy) => void) | null = null;
  private readonly queue: Trophy[] = [];
  private element: HTMLElement | null = null;
  private timer = 0;
  private shownAt = 0;
  private stopConfetti: (() => void) | null = null;
  private idle: (() => void)[] = [];
  private readonly strings: BadgeMomentStrings;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab' && !e.repeat) this.skip();
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly options: BadgeMomentOptions = {},
  ) {
    injectStyle('mooblox-badge-style', CSS);
    this.strings = { ...DEFAULT_BADGE_STRINGS, ...options.strings };
  }

  get isOpen(): boolean {
    return this.element !== null;
  }

  /** Shows a card per badge, one after another; `then` runs once the last one is gone (at once when there are none). */
  play(badges: readonly Trophy[], then?: () => void): void {
    if (then) this.idle.push(then);
    this.queue.push(...badges);
    if (!this.element) this.next();
  }

  /** Ends the current card and shows the next queued badge, if any. */
  next(): void {
    this.hide();
    const badge = this.queue.shift();
    if (badge) {
      this.show(badge);
      return;
    }
    const done = this.idle;
    this.idle = [];
    for (const f of done) f();
  }

  private skip(): void {
    if (performance.now() - this.shownAt >= HOLD_MS) this.next();
  }

  private show(badge: Trophy): void {
    const calm = this.options.reducedMotion?.() ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = document.createElement('div');
    el.className = `mooblox-badge-moment${calm ? ' is-calm' : ''}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<div class="mooblox-badge-card"><div class="mooblox-badge-cup"><div class="mooblox-badge-rays"></div>${CUP}<img alt=""></div>
      <h2 class="mooblox-badge-title"></h2><p class="mooblox-badge-skip"></p></div>`;
    const img = el.querySelector('img')!;
    img.src = badge.imageUrl;
    img.alt = badge.name;
    el.querySelector('.mooblox-badge-title')!.textContent = fill(this.strings.badge_earned, { badge: badge.name });
    el.querySelector('.mooblox-badge-skip')!.textContent = this.strings.levelup_skip;
    el.addEventListener('pointerdown', () => this.skip());
    this.host.appendChild(el);
    this.element = el;
    this.shownAt = performance.now();
    window.addEventListener('keydown', this.onKey, true);
    if (!calm) this.stopConfetti = confetti(el, CONFETTI_MS);
    this.onShow?.(badge);
    this.timer = window.setTimeout(() => this.next(), SHOW_MS);
  }

  private hide(): void {
    if (!this.element) return;
    this.element.remove();
    this.element = null;
    this.stopConfetti?.();
    this.stopConfetti = null;
    clearTimeout(this.timer);
    window.removeEventListener('keydown', this.onKey, true);
  }
}
