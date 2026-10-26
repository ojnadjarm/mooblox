import { injectStyle, UI_FONT } from '../ui/style';
import type { HubCourse } from './courses';
import { fill, type HubStrings } from './hub-strings';

const CSS = `
.mooblox-hub-title { position: absolute; z-index: 10; top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left));
  margin: 0; height: 52px; padding: 0 20px; box-sizing: border-box; border-radius: 999px; border: 4px solid #fff; background: #2fa39a; color: #fff;
  display: inline-flex; align-items: center; font: 900 20px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-hub-floor { position: absolute; z-index: 10; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));
  height: 52px; box-sizing: border-box; border-radius: 999px; border: 4px solid #fff; background: #2b2f3a; color: #fff;
  display: inline-flex; align-items: center; gap: 4px; padding: 0 4px; font: 900 17px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-hub-floor[hidden] { display: none; }
.mooblox-hub-floor span { padding: 0 6px; white-space: nowrap; }
.mooblox-hub-floor button { width: 38px; height: 38px; border-radius: 50%; border: 0; background: #ffc21a; color: #2b2f3a; font: 900 18px ${UI_FONT};
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.mooblox-hub-floor button:focus-visible, .mooblox-hub-list a:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-hub-hint { position: absolute; z-index: 9; left: 50%; transform: translateX(-50%); bottom: calc(max(16px, env(safe-area-inset-bottom)) + 124px);
  max-width: calc(100% - 24px); box-sizing: border-box; padding: 10px 18px; border-radius: 999px; background: rgba(43, 47, 58, .82); color: #fff;
  font: 800 17px ${UI_FONT}; text-align: center; pointer-events: none; transition: opacity .4s; }
@media (pointer: coarse) {
  .mooblox-hub-hint { --pad: max(clamp(16px, 4vmin, 40px), env(safe-area-inset-left), env(safe-area-inset-right)); --size: clamp(110px, 26vmin, 180px);
    max-width: calc(100% - 2 * (var(--pad) + var(--size) + 8px)); bottom: calc(var(--pad) + env(safe-area-inset-bottom) + var(--size) / 2);
    transform: translate(-50%, 50%); padding: 8px 10px; border-radius: 18px; }
}
.mooblox-hub-hint[hidden] { display: block; opacity: 0; }
.mooblox-hub-empty { position: absolute; z-index: 11; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100% - 32px));
  box-sizing: border-box; padding: 24px 26px; border-radius: 28px; border: 5px solid #fff; background: #f6ead3; color: #2b2f3a; text-align: center;
  font: 700 18px/1.4 ${UI_FONT}; box-shadow: 0 10px 30px rgba(0, 40, 80, .35); }
.mooblox-hub-empty h2 { margin: 0 0 8px; font: 900 28px ${UI_FONT}; color: #2fa39a; }
.mooblox-hub-empty p { margin: 0; }
.mooblox-hub-list { position: absolute; z-index: 12; left: 0; top: 0; margin: 0; padding: 0; list-style: none; }
.mooblox-hub-list a { position: absolute; left: -10000px; top: 0; white-space: nowrap; }
.mooblox-hub-list a:focus { left: max(12px, env(safe-area-inset-left)); top: 76px; padding: 10px 16px; border-radius: 16px; background: #fff; color: #2b2f3a;
  font: 800 17px ${UI_FONT}; }
.mooblox-hub-flash { position: absolute; z-index: 20; inset: 0; background: radial-gradient(circle, #fff 0%, #fff 55%, #dff8ff 100%); opacity: 0;
  pointer-events: none; }
.mooblox-hub-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 600px) {
  .mooblox-hub-title { display: none; }
  .mooblox-hub-floor { height: 48px; font-size: 15px; }
  .mooblox-hub-floor .mooblox-hub-floor-long { display: none; }
  .mooblox-hub-hint { font-size: 15px; border-radius: 18px; }
}
@media (min-width: 601px) { .mooblox-hub-floor .mooblox-hub-floor-short { display: none; } }
`;

/** The hub's DOM: title, floor switcher, first hint, empty card, a keyboard list of every world, the warp white-out and a live region. */
export class HubHud {
  private readonly floorBox: HTMLElement;
  private readonly floorLong: HTMLElement;
  private readonly floorShort: HTMLElement;
  private readonly flashBox: HTMLElement;
  private readonly live: HTMLElement;
  readonly hint: HTMLElement;
  readonly up: HTMLButtonElement;
  readonly down: HTMLButtonElement;

  constructor(
    host: HTMLElement,
    private readonly s: HubStrings,
    courses: readonly HubCourse[],
    move: (step: 1 | -1) => void,
  ) {
    injectStyle('mooblox-hub-style', CSS);
    const title = document.createElement('h1');
    title.className = 'mooblox-hub-title';
    title.textContent = s.hub_title;
    this.floorBox = document.createElement('div');
    this.floorBox.className = 'mooblox-hub-floor';
    this.floorBox.setAttribute('role', 'group');
    this.down = button('▼', s.hub_down, () => move(-1));
    this.up = button('▲', s.hub_up, () => move(1));
    this.floorLong = document.createElement('span');
    this.floorLong.className = 'mooblox-hub-floor-long';
    this.floorShort = document.createElement('span');
    this.floorShort.className = 'mooblox-hub-floor-short';
    this.floorShort.setAttribute('aria-hidden', 'true');
    this.floorBox.append(this.down, this.floorLong, this.floorShort, this.up);
    this.hint = document.createElement('div');
    this.hint.className = 'mooblox-hub-hint';
    this.hint.textContent = s.hub_hint;
    this.hint.hidden = courses.length === 0;
    const list = document.createElement('ul');
    list.className = 'mooblox-hub-list';
    list.setAttribute('aria-label', s.hub_list);
    for (const c of courses) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = c.url;
      a.textContent = c.fullname;
      li.append(a);
      list.append(li);
    }
    this.flashBox = document.createElement('div');
    this.flashBox.className = 'mooblox-hub-flash';
    this.live = document.createElement('div');
    this.live.className = 'mooblox-hub-live';
    this.live.setAttribute('aria-live', 'polite');
    host.append(title, this.floorBox, this.hint, list, this.flashBox, this.live);
    if (courses.length === 0) {
      const card = document.createElement('div');
      card.className = 'mooblox-hub-empty';
      card.setAttribute('role', 'status');
      const h = document.createElement('h2');
      h.textContent = s.hub_empty_title;
      const p = document.createElement('p');
      p.textContent = s.hub_empty_text;
      card.append(h, p);
      host.append(card);
    }
  }

  /** Shows "Floor n of m" (hidden with one floor). */
  setFloor(floor: number, floors: number): void {
    this.floorBox.hidden = floors < 2;
    this.floorLong.textContent = fill(this.s.hub_floor, { floor: floor + 1, floors });
    this.floorShort.textContent = `${floor + 1}/${floors}`;
    this.floorBox.setAttribute('aria-label', this.floorLong.textContent);
  }

  /** White-out level 0..1. */
  flash(level: number): void {
    this.flashBox.style.opacity = level.toFixed(3);
  }

  say(text: string): void {
    this.live.textContent = text;
  }
}

function button(label: string, name: string, act: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-label', name);
  b.title = name;
  b.addEventListener('click', act);
  return b;
}
