import type { AvatarFactory, AvatarLook } from '../player/avatar-kit';
import { colourOf, labelOf, OPTIONS, type Field } from '../player/character/catalog';
import { randomLook, withField, type CharacterLook } from '../player/character/look';
import { toCharacter } from '../player/look';
import { LookHistory } from './creator/history';
import { CreatorPreview } from './creator/preview';
import { TABS } from './creator/tabs';
import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-hud-avatar { position: absolute; z-index: 10; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));
  height: 52px; padding: 0 16px 0 12px; border-radius: 999px; border: 4px solid #fff; background: #8e24aa; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px; font: 800 17px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-hud-avatar svg { width: 26px; height: 26px; }
.mooblox-creator button:focus-visible, .mooblox-hud-avatar:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-creator { position: absolute; inset: 0; z-index: 30; box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr);
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  background: linear-gradient(#a9dcff, #e8f6ff 60%); font: 700 16px/1.3 ${UI_FONT}; color: #2b2f3a; overflow: hidden; }
.mooblox-creator[hidden] { display: none; }
.mooblox-creator * { box-sizing: border-box; }
.mooblox-creator-bar { width: min(1500px, 100%); margin: 0 auto 10px; display: flex; align-items: center; gap: 10px; }
.mooblox-creator-title { flex: 1; min-width: 0; margin: 0; font: 900 clamp(20px, 2.4vw, 32px) ${UI_FONT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mooblox-creator-btn { min-height: 48px; padding: 0 18px; border-radius: 999px; border: 0; font: 800 17px ${UI_FONT}; cursor: pointer; flex: none;
  background: #fff; color: #2b2f3a; box-shadow: 0 3px 0 rgba(0, 40, 80, .18); touch-action: manipulation; }
.mooblox-creator-btn:disabled { opacity: .45; cursor: default; }
.mooblox-creator-save { background: #2fbf4a; color: #fff; }
.mooblox-creator-body { width: min(1500px, 100%); margin: 0 auto; min-height: 0; display: grid; gap: 14px;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); }
.mooblox-creator-stage { position: relative; min-height: 0; border-radius: 24px; background: radial-gradient(circle at 50% 85%, #fff 0, #d7efff 45%, transparent 70%);
  touch-action: none; cursor: grab; overflow: hidden; }
.mooblox-creator-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.mooblox-creator-tools { position: absolute; z-index: 1; left: 0; right: 0; bottom: 12px; display: flex; justify-content: center; gap: 10px; }
.mooblox-creator-panel { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; background: #fff; border-radius: 24px;
  padding: 12px; box-shadow: 0 10px 30px rgba(0, 30, 70, .18); }
.mooblox-creator-tabs { display: flex; gap: 8px; }
.mooblox-creator-tab { flex: 1 1 0; min-width: max-content; min-height: 56px; border-radius: 16px; border: 0; background: #eef4fb; color: #2b2f3a; font: 900 clamp(15px, 1.4vw, 20px) ${UI_FONT};
  cursor: pointer; touch-action: manipulation; }
.mooblox-creator-tab[aria-selected="true"] { background: #1e88e5; color: #fff; }
.mooblox-creator-options { overflow-y: auto; overscroll-behavior: contain; padding: 4px; display: grid; gap: 14px; align-content: start; }
.mooblox-creator-label { font-size: 14px; color: #5b6475; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
.mooblox-creator-row { display: flex; flex-wrap: wrap; gap: 8px; }
.mooblox-chip { min-height: 48px; padding: 0 16px; border-radius: 14px; border: 3px solid #dde6f0; background: #f7fafd; color: #2b2f3a;
  font: 800 16px ${UI_FONT}; cursor: pointer; touch-action: manipulation; }
.mooblox-swatch { width: 48px; height: 48px; padding: 0; border-radius: 50%; border: 3px solid #fff; cursor: pointer; box-shadow: 0 0 0 2px #dde6f0;
  touch-action: manipulation; }
.mooblox-creator [aria-pressed="true"] { border-color: #1e88e5; box-shadow: 0 0 0 3px #1e88e5; }
@media (max-width: 760px), (max-aspect-ratio: 4/5) {
  .mooblox-creator-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(200px, 38%) minmax(0, 1fr); }
  .mooblox-creator-title { font-size: 20px; }
  .mooblox-creator-btn { padding: 0 14px; }
}
@media (max-width: 420px) {
  .mooblox-creator-tab { min-height: 48px; padding: 0 2px; font-size: 14px; }
}
`;

const ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7.5" r="4.5"/><path d="M3.5 21c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z"/></svg>';

/** Labels of the creator. */
export interface AvatarPickerStrings {
  readonly avatar: string;
  readonly creator_title: string;
  readonly creator_hair: string;
  readonly creator_face: string;
  readonly creator_skin: string;
  readonly creator_clothes: string;
  readonly creator_random: string;
  readonly creator_undo: string;
  readonly creator_save: string;
  readonly creator_cancel: string;
  readonly [field: `creator_field_${string}`]: string;
}

export const DEFAULT_AVATAR_PICKER_STRINGS: AvatarPickerStrings = {
  avatar: 'My avatar',
  creator_title: 'Make your character',
  creator_hair: 'Hair',
  creator_face: 'Face',
  creator_skin: 'Skin',
  creator_clothes: 'Clothes',
  creator_random: 'Surprise me',
  creator_undo: 'Undo',
  creator_save: 'Save',
  creator_cancel: 'Cancel',
  creator_field_hair: 'Hairstyle',
  creator_field_hairc: 'Hair colour',
  creator_field_eyes: 'Eyes',
  creator_field_eyec: 'Eye colour',
  creator_field_brows: 'Eyebrows',
  creator_field_mouth: 'Mouth',
  creator_field_glasses: 'Glasses',
  creator_field_glassesc: 'Glasses colour',
  creator_field_skin: 'Skin tone',
  creator_field_top: 'Top',
  creator_field_topc: 'Top colour',
  creator_field_bottom: 'Bottom',
  creator_field_bottomc: 'Bottom colour',
  creator_field_shoes: 'Shoes',
  creator_field_shoesc: 'Shoes colour',
};

/** A tab another module adds to the creator (the wardrobe): it edits a draft the preview shows, kept on Save. */
export interface CreatorTab {
  readonly id: string;
  readonly label: string;
  /** Fills the options panel; `changed` re-renders the preview. */
  render(into: HTMLElement, changed: () => void): void;
  /** Keeps the draft on Save; true when it changed what the player wears. */
  commit(): boolean;
  /** Drops the draft (on open and Cancel). */
  revert(): void;
}

/** What the creator asks of its owner. */
export interface AvatarPickerActions {
  opened(): void;
  closed(): void;
  /** The look on Save, to wear now (also when only an added tab's draft changed). */
  picked(look: AvatarLook): void;
  /** Called on Save when the look differs from the one last kept. */
  kept(look: AvatarLook): void;
}

/** HUD button plus a full-screen character creator: tabs, live turntable, random, undo; Save keeps, Cancel or Esc drops. */
export class AvatarPicker {
  readonly button: HTMLButtonElement;
  readonly element: HTMLElement;
  readonly preview: CreatorPreview;
  private readonly history: LookHistory;
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly options: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private tab: string = 'hair';
  private readonly extra: CreatorTab[] = [];
  private readonly tabsElement: HTMLElement;
  private keptLook: CharacterLook;

  constructor(
    host: HTMLElement,
    factory: AvatarFactory,
    look: AvatarLook,
    private readonly strings: AvatarPickerStrings,
    private readonly actions: AvatarPickerActions,
  ) {
    injectStyle('mooblox-creator-style', CSS);
    this.keptLook = toCharacter(look);
    this.history = new LookHistory(this.keptLook);
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'mooblox-hud-avatar';
    this.button.innerHTML = `${ICON}<span></span>`;
    this.button.querySelector('span')!.textContent = strings.avatar;
    this.button.addEventListener('click', () => this.open());
    this.element = document.createElement('section');
    this.element.className = 'mooblox-creator';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'mooblox-creator-title');
    this.element.innerHTML = `<div class="mooblox-creator-bar"><h2 class="mooblox-creator-title" id="mooblox-creator-title"></h2></div>
      <div class="mooblox-creator-body"><div class="mooblox-creator-stage"><div class="mooblox-creator-tools"></div></div>
      <div class="mooblox-creator-panel"><div class="mooblox-creator-tabs" role="tablist"></div><div class="mooblox-creator-options" role="tabpanel"></div></div></div>`;
    this.element.querySelector('h2')!.textContent = strings.creator_title;
    const bar = this.element.querySelector('.mooblox-creator-bar')!;
    const cancel = this.button_('mooblox-creator-btn mooblox-creator-cancel', strings.creator_cancel, () => this.close(false));
    const save = this.button_('mooblox-creator-btn mooblox-creator-save', strings.creator_save, () => this.close(true));
    bar.append(cancel, save);
    const tools = this.element.querySelector('.mooblox-creator-tools')!;
    this.undoButton = this.button_('mooblox-creator-btn mooblox-creator-undo', strings.creator_undo, () => this.show(this.history.undo()));
    tools.append(
      this.button_('mooblox-creator-btn mooblox-creator-random', strings.creator_random, () => this.change(randomLook())),
      this.undoButton,
    );
    const stage = this.element.querySelector<HTMLElement>('.mooblox-creator-stage')!;
    this.preview = new CreatorPreview(stage, factory);
    this.tabsElement = this.element.querySelector<HTMLElement>('.mooblox-creator-tabs')!;
    for (const t of TABS) this.tabButton(t.id, strings[`creator_${t.id}`]);
    this.options = this.element.querySelector('.mooblox-creator-options')!;
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close(false);
      }
    });
    host.append(this.button, this.element);
  }

  /** Adds a tab after the built-in ones. */
  addTab(tab: CreatorTab): void {
    this.extra.push(tab);
    this.tabButton(tab.id, tab.label);
  }

  /** Opens the creator on tab `id`. */
  openTab(id: string): void {
    this.tab = id;
    if (this.isOpen) this.selectTab(id);
    else this.open();
  }

  /** The look being edited (the saved one while closed). */
  get current(): CharacterLook {
    return this.history.current;
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.history.reset(this.keptLook);
    for (const t of this.extra) t.revert();
    this.element.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.actions.opened();
    this.preview.start();
    this.selectTab(this.tab);
    void this.preview.show(this.current);
    this.tabButtons.get(this.tab)?.focus();
  }

  /** Closes; `save` wears and keeps the look, otherwise it is dropped. */
  close(save: boolean): void {
    if (!this.isOpen) return;
    const look = this.current;
    this.element.hidden = true;
    this.preview.stop();
    this.button.setAttribute('aria-expanded', 'false');
    this.button.focus();
    const dressed = save && this.extra.map((t) => t.commit()).some(Boolean);
    if (!save) for (const t of this.extra) t.revert();
    if (save && JSON.stringify(look) !== JSON.stringify(this.keptLook)) {
      this.keptLook = look;
      this.actions.picked(look);
      this.actions.kept(look);
    } else if (dressed) {
      this.actions.picked(look);
    }
    this.history.reset(this.keptLook);
    this.actions.closed();
  }

  /** Sets one field (what an option button does). */
  set(field: Field, id: string): void {
    this.change(withField(this.current, field, id));
  }

  private change(look: CharacterLook): void {
    this.history.push(look);
    this.show(this.current);
  }

  private show(look: CharacterLook): void {
    void this.preview.show(look);
    this.mark();
  }

  private tabButton(id: string, label: string): void {
    const b = this.button_('mooblox-creator-tab', label, () => this.selectTab(id));
    b.setAttribute('role', 'tab');
    b.dataset['tab'] = id;
    this.tabsElement.appendChild(b);
    this.tabButtons.set(id, b);
  }

  private selectTab(id: string): void {
    this.tab = id;
    for (const [t, b] of this.tabButtons) b.setAttribute('aria-selected', String(t === id));
    this.options.replaceChildren();
    const extra = this.extra.find((t) => t.id === id);
    if (extra) {
      extra.render(this.options, () => void this.preview.show(this.current));
      this.undoButton.disabled = !this.history.canUndo;
      return;
    }
    for (const field of (TABS.find((t) => t.id === id) ?? TABS[0]!).fields) {
      const group = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'mooblox-creator-label';
      label.id = `mooblox-creator-${field}`;
      label.textContent = this.strings[`creator_field_${field}`] ?? field;
      const row = document.createElement('div');
      row.className = 'mooblox-creator-row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-labelledby', label.id);
      for (const option of OPTIONS[field]) {
        const hex = colourOf(field, option);
        const b = this.button_(hex === null ? 'mooblox-chip' : 'mooblox-swatch', labelOf(option), () => this.set(field, option), hex === null);
        if (hex !== null) b.style.background = `#${hex.toString(16).padStart(6, '0')}`;
        b.dataset['field'] = field;
        b.dataset['option'] = option;
        row.appendChild(b);
      }
      group.append(label, row);
      this.options.appendChild(group);
    }
    this.mark();
  }

  private mark(): void {
    const look = this.current;
    for (const b of this.options.querySelectorAll<HTMLButtonElement>('[data-field]')) {
      b.setAttribute('aria-pressed', String(look[b.dataset['field'] as Field] === b.dataset['option']));
    }
    this.undoButton.disabled = !this.history.canUndo;
  }

  private button_(className: string, label: string, onClick: () => void, text = true): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    if (text) b.textContent = label;
    else b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', onClick);
    return b;
  }
}
