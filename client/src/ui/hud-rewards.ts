import type { HudView } from './hud-model';
import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-hud-rewards { position: absolute; z-index: 10; box-sizing: border-box; pointer-events: none;
  top: calc(max(12px, env(safe-area-inset-top)) + 62px); left: max(12px, env(safe-area-inset-left));
  width: min(340px, calc(100% - 24px)); padding: 8px 12px 9px 8px; border-radius: 22px; border: 4px solid #fff;
  background: rgba(255, 252, 244, .94); color: #2b2f3a; font: 800 15px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3);
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "chip bar leaf" "quest quest quest";
  align-items: center; column-gap: 10px; row-gap: 6px; }
.mooblox-hud-rewards[hidden] { display: none; }
.mooblox-hud-chip { grid-area: chip; min-width: 40px; height: 40px; padding: 0 6px; box-sizing: border-box; border-radius: 14px;
  background: #2fa39a; box-shadow: inset 0 -4px 0 #1f7a78; color: #fff; display: grid; place-items: center; font-size: 20px; line-height: 1; }
.mooblox-hud-bar { grid-area: bar; min-width: 0; }
.mooblox-hud-track { height: 14px; border-radius: 999px; background: #f4e6cc; box-shadow: inset 0 2px 0 #d2bc9a; overflow: hidden; }
.mooblox-hud-fill { height: 100%; width: 0; border-radius: inherit; background: #f6c445; box-shadow: inset 0 -4px 0 #d49a2a;
  transition: width .6s cubic-bezier(.2, .8, .2, 1); }
.mooblox-hud-xp { margin-top: 2px; font-size: 13px; color: #5a5f6e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mooblox-hud-leaf { grid-area: leaf; display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px 4px 6px; border-radius: 999px;
  background: #e3f3d9; color: #2f8466; font-size: 13px; white-space: nowrap; }
.mooblox-hud-leaf[hidden] { display: none; }
.mooblox-hud-leaf svg { width: 20px; height: 20px; flex: none; }
.mooblox-hud-quest { grid-area: quest; display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 14px; }
.mooblox-hud-quest svg { width: 20px; height: 20px; flex: none; color: #e0844f; }
.mooblox-hud-quest span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mooblox-hud-quest b { margin-left: auto; padding-left: 6px; color: #2f7fe0; white-space: nowrap; }
@media (max-width: 480px) { .mooblox-hud-rewards { width: calc(100% - 24px); font-size: 14px; padding: 6px 10px 7px 6px; column-gap: 8px; }
  .mooblox-hud-xp { font-size: 12px; } .mooblox-hud-leaf { font-size: 12px; } }
@media (min-width: 1800px) { .mooblox-hud-rewards { width: 380px; font-size: 16px; } }
@media (prefers-reduced-motion: reduce) { .mooblox-hud-fill { transition: none; } }
`;

const LEAF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z" fill="#5db761"/><path d="M5 19c0-8 5-14 15-15L5 19z" fill="#2f8466"/><path d="M4 20l9-9" stroke="#2f8466" stroke-width="2" stroke-linecap="round"/></svg>';
const FLAG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6 3h2v18H6z"/><path d="M8 4h11l-3 4 3 4H8z"/></svg>';

/** XP bar, level chip, next quest and learning weeks, under the Book button. */
export class HudRewards {
  readonly element: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly xp: HTMLElement;
  private readonly leaf: HTMLElement;
  private readonly quest: HTMLElement;
  private readonly progress: HTMLElement;

  constructor(host: HTMLElement) {
    injectStyle('mooblox-hud-rewards-style', CSS);
    this.element = document.createElement('div');
    this.element.className = 'mooblox-hud-rewards';
    this.element.setAttribute('role', 'status');
    this.element.hidden = true;
    this.element.innerHTML = `<div class="mooblox-hud-chip"></div>
      <div class="mooblox-hud-bar"><div class="mooblox-hud-track"><div class="mooblox-hud-fill"></div></div><div class="mooblox-hud-xp"></div></div>
      <div class="mooblox-hud-leaf">${LEAF}<span></span></div>
      <div class="mooblox-hud-quest">${FLAG}<span></span><b></b></div>`;
    const q = (s: string) => this.element.querySelector<HTMLElement>(s)!;
    this.chip = q('.mooblox-hud-chip');
    this.fill = q('.mooblox-hud-fill');
    this.xp = q('.mooblox-hud-xp');
    this.leaf = q('.mooblox-hud-leaf');
    this.quest = q('.mooblox-hud-quest span');
    this.progress = q('.mooblox-hud-quest b');
    host.appendChild(this.element);
  }

  /** Shows `view`, or hides the HUD when it is null (rewards off). */
  show(view: HudView | null): void {
    this.element.hidden = !view;
    if (!view) {
      return;
    }
    this.chip.textContent = String(view.level);
    this.chip.title = view.levelLabel;
    this.chip.setAttribute('aria-label', view.levelLabel);
    this.fill.style.width = `${Math.round(view.fraction * 1000) / 10}%`;
    this.xp.textContent = view.xpLabel;
    this.leaf.hidden = !view.weeks;
    this.leaf.querySelector('span')!.textContent = view.weeks ? String(view.weekCount) : '';
    this.leaf.title = view.weeks ?? '';
    this.leaf.setAttribute('aria-label', view.weeks ?? '');
    this.quest.textContent = view.quest;
    this.progress.textContent = view.progress;
  }

  dispose(): void {
    this.element.remove();
  }
}
