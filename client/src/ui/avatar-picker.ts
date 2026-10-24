import type { AvatarBody, AvatarLook } from '../player/avatar-kit';
import { SHIRT_COLOURS } from '../player/look';
import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-hud-avatar { position: absolute; z-index: 10; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));
  height: 52px; padding: 0 16px 0 12px; border-radius: 999px; border: 4px solid #fff; background: #8e24aa; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px; font: 800 17px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-hud-avatar svg { width: 26px; height: 26px; }
.mooblox-hud-avatar:focus-visible, .mooblox-picker button:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-picker { position: absolute; z-index: 15; left: 50%; transform: translateX(-50%); bottom: max(12px, env(safe-area-inset-bottom));
  box-sizing: border-box; width: min(720px, calc(100% - 24px)); max-height: calc(100% - 88px); overflow-y: auto; overscroll-behavior: contain;
  padding: 12px 16px 16px; border-radius: 20px; background: #fff; box-shadow: 0 12px 40px rgba(0, 30, 70, .4);
  font: 700 16px/1.3 ${UI_FONT}; color: #2b2f3a; display: grid; gap: 10px; }
.mooblox-picker[hidden] { display: none; }
.mooblox-picker-bar { display: flex; align-items: center; gap: 12px; }
.mooblox-picker-title { flex: 1; margin: 0; font: inherit; font-size: 20px; }
.mooblox-picker-done { min-height: 44px; padding: 0 20px; border-radius: 999px; border: 0; background: #2fbf4a; color: #fff;
  font: 800 17px ${UI_FONT}; cursor: pointer; }
.mooblox-picker-label { font-size: 14px; color: #5b6475; text-transform: uppercase; letter-spacing: .04em; }
.mooblox-picker-bodies { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 8px; }
.mooblox-picker-body { aspect-ratio: 1; width: 100%; padding: 0; border-radius: 14px; border: 3px solid #dde6f0; cursor: pointer;
  background-color: #f4f7fb; background-repeat: no-repeat; }
.mooblox-picker-colours { display: flex; flex-wrap: wrap; gap: 10px; }
.mooblox-picker-colour { width: 44px; height: 44px; padding: 0; border-radius: 50%; border: 3px solid #fff; cursor: pointer;
  box-shadow: 0 0 0 2px #dde6f0; }
.mooblox-picker-colour.original { background: conic-gradient(#e53935 0 25%, #fdd835 0 50%, #43a047 0 75%, #1e88e5 0); }
.mooblox-picker [aria-pressed="true"] { border-color: #1e88e5; box-shadow: 0 0 0 3px #1e88e5; }
@media (max-width: 600px) {
  .mooblox-picker-bodies { grid-template-columns: none; grid-template-rows: repeat(2, 52px); grid-auto-flow: column; grid-auto-columns: 52px;
    overflow-x: auto; padding: 4px; margin: -4px; }
  .mooblox-picker-colours { flex-wrap: nowrap; overflow-x: auto; padding: 4px; margin: -4px; }
  .mooblox-picker-colour { flex: none; }
}
`;

const ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7.5" r="4.5"/><path d="M3.5 21c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z"/></svg>';

/** Labels of the picker. */
export interface AvatarPickerStrings {
  readonly avatar: string;
  readonly body: string;
  readonly colour: string;
  readonly original: string;
  readonly done: string;
}

export const DEFAULT_AVATAR_PICKER_STRINGS: AvatarPickerStrings = {
  avatar: 'My avatar',
  body: 'Body',
  colour: 'Shirt colour',
  original: 'Original',
  done: 'Done',
};

/** What the picker asks of its owner. */
export interface AvatarPickerActions {
  opened(): void;
  picked(look: AvatarLook): void;
  /** Called on close when the look differs from the one last kept. */
  kept(look: AvatarLook): void;
}

/** HUD button plus a bottom sheet of preset bodies and shirt colours; each pick previews live, closing keeps it. */
export class AvatarPicker {
  readonly button: HTMLButtonElement;
  readonly element: HTMLElement;
  private readonly bodyButtons = new Map<string, HTMLButtonElement>();
  private readonly colourButtons = new Map<number | null, HTMLButtonElement>();
  private keptLook: AvatarLook;

  constructor(
    host: HTMLElement,
    bodies: readonly AvatarBody[],
    private look: AvatarLook,
    strings: AvatarPickerStrings,
    private readonly actions: AvatarPickerActions,
  ) {
    injectStyle('mooblox-picker-style', CSS);
    this.keptLook = look;
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'mooblox-hud-avatar';
    this.button.innerHTML = `${ICON}<span></span>`;
    this.button.querySelector('span')!.textContent = strings.avatar;
    this.button.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    this.element = document.createElement('section');
    this.element.className = 'mooblox-picker';
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'mooblox-picker-title');
    this.element.innerHTML = `<div class="mooblox-picker-bar"><h2 class="mooblox-picker-title" id="mooblox-picker-title"></h2>
        <button type="button" class="mooblox-picker-done"></button></div>
      <div class="mooblox-picker-label" id="mooblox-picker-bodies"></div><div class="mooblox-picker-bodies" role="group" aria-labelledby="mooblox-picker-bodies"></div>
      <div class="mooblox-picker-label" id="mooblox-picker-colours"></div><div class="mooblox-picker-colours" role="group" aria-labelledby="mooblox-picker-colours"></div>`;
    this.element.querySelector('h2')!.textContent = strings.avatar;
    this.element.querySelector('#mooblox-picker-bodies')!.textContent = strings.body;
    this.element.querySelector('#mooblox-picker-colours')!.textContent = strings.colour;
    const done = this.element.querySelector<HTMLButtonElement>('.mooblox-picker-done')!;
    done.textContent = strings.done;
    done.addEventListener('click', () => this.close());
    const bodyGroup = this.element.querySelector('.mooblox-picker-bodies')!;
    bodies.forEach((body, i) => {
      const b = this.choice('mooblox-picker-body', `${strings.body} ${i + 1}`, () => this.pick({ ...this.look, skin: body.id }));
      const p = body.preview;
      const w = p.x1 - p.x0;
      const h = p.y1 - p.y0;
      b.style.backgroundImage = `url("${p.url}")`;
      b.style.backgroundSize = `${100 / w}% ${100 / h}%`;
      b.style.backgroundPosition = `${(p.x0 / (1 - w)) * 100}% ${(p.y0 / (1 - h)) * 100}%`;
      b.dataset['body'] = body.id;
      bodyGroup.appendChild(b);
      this.bodyButtons.set(body.id, b);
    });
    const colourGroup = this.element.querySelector('.mooblox-picker-colours')!;
    const colours: [string, number | null][] = [['original', null], ...Object.entries(SHIRT_COLOURS)];
    for (const [key, hex] of colours) {
      const label = key === 'original' ? strings.original : key;
      const b = this.choice('mooblox-picker-colour', label, () => this.pick({ ...this.look, tint: hex }));
      if (hex === null) {
        b.classList.add('original');
      } else {
        b.style.background = `#${hex.toString(16).padStart(6, '0')}`;
      }
      b.dataset['colour'] = key;
      colourGroup.appendChild(b);
      this.colourButtons.set(hex, b);
    }
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    host.append(this.button, this.element);
    this.mark();
  }

  get current(): AvatarLook {
    return this.look;
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.actions.opened();
    (this.bodyButtons.get(this.look.skin) ?? this.element.querySelector('button'))?.focus();
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }
    this.element.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.button.focus();
    if (this.look.skin !== this.keptLook.skin || this.look.tint !== this.keptLook.tint) {
      this.keptLook = this.look;
      this.actions.kept(this.look);
    }
  }

  private pick(look: AvatarLook): void {
    if (look.skin === this.look.skin && look.tint === this.look.tint) {
      return;
    }
    this.look = look;
    this.mark();
    this.actions.picked(look);
  }

  private mark(): void {
    for (const [id, b] of this.bodyButtons) {
      b.setAttribute('aria-pressed', String(id === this.look.skin));
    }
    for (const [hex, b] of this.colourButtons) {
      b.setAttribute('aria-pressed', String(hex === this.look.tint));
    }
  }

  private choice(className: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', onClick);
    return b;
  }
}
