import { NO_LOOK, type Look } from '../domain/rewards';
import type { CreatorTab } from './avatar-picker';
import { injectStyle, UI_FONT } from './style';
import { toggle, WARDROBE_SLOTS, type WardrobeItem, type WardrobeSlot, type WardrobeStrings } from './wardrobe-model';

const CSS = `
.mooblox-ward-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.mooblox-ward-item { position: relative; min-height: 112px; padding: 8px 6px; border-radius: 16px; border: 3px solid #dde6f0; background: #f7fafd;
  color: #2b2f3a; font: 800 15px/1.15 ${UI_FONT}; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;
  text-align: center; touch-action: manipulation; }
.mooblox-ward-item svg { width: 48px; height: 48px; flex: none; }
.mooblox-ward-item small { font: 700 12px/1.2 ${UI_FONT}; color: #6b6f7c; }
.mooblox-ward-item:disabled { cursor: not-allowed; background: #eef0f4; border-style: dashed; color: #4a4e5a; }
.mooblox-ward-item:disabled svg { filter: grayscale(1) brightness(.35); opacity: .55; }
.mooblox-ward-lock { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; color: #6b6f7c; }
.mooblox-ward-item .mooblox-ward-lock svg { width: 22px; height: 22px; filter: none; opacity: 1; }
.mooblox-ward-none { min-height: 112px; }
@media (max-width: 420px) { .mooblox-ward-grid { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); } .mooblox-ward-item { font-size: 14px; } }
`;

const LOCK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';

/** Accent colour of an item's icon (art bible palette). */
const ACCENT: Readonly<Record<string, string>> = {
  'hat-cap': '#f07a5f', 'hat-beanie': '#2fa39a', 'hat-explorer': '#e0c38a', 'hat-crown': '#f6c445', 'hat-wizard': '#8e5ad8',
  'hat-pirate': '#2b2f3a', 'hat-chef': '#f4e6cc', 'hat-astronaut': '#c7d3e0', 'hat-tophat': '#2b2f3a', 'hat-party': '#f6c445',
  'hat-glasses': '#f07a5f', 'hat-sunglasses': '#1f5fa8', 'outfit-lava': '#e5484d', 'outfit-ocean': '#1f5fa8', 'outfit-forest': '#5db761',
  'outfit-sunset': '#ff9a3c', 'outfit-space': '#c7d3e0', 'outfit-candy': '#f28bb8', 'outfit-gold': '#f6c445', 'outfit-snow': '#e8f4ff',
  'outfit-night': '#2b3a6b', 'pet-cat': '#ff9a3c', 'pet-dog': '#b97a4a', 'pet-bunny': '#f4e6cc', 'pet-fox': '#f07a5f',
  'pet-panda': '#2b2f3a', 'pet-penguin': '#2b3a6b',
};

/** Slot icons (faceted, flat), filled with the item's accent. */
const ICON: Readonly<Record<WardrobeSlot, (fill: string) => string>> = {
  hat: (c) => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 34h36l-4 6H10z" fill="#2b2f3a" opacity=".25"/><path d="M12 32l4-18 8-4 8 4 4 18z" fill="${c}"/><path d="M24 10l8 4 4 18H24z" fill="#000" opacity=".12"/><path d="M5 31h38v4H5z" fill="${c}"/><path d="M5 33h38v2H5z" fill="#000" opacity=".15"/></svg>`,
  outfit: (c) => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 7l-11 7 4 9 5-3v21h18V20l5 3 4-9-11-7c-1 4-4 6-7 6s-6-2-7-6z" fill="${c}"/><path d="M24 13c3 0 6-2 7-6l11 7-4 9-5-3v21h-9z" fill="#000" opacity=".12"/></svg>`,
  pet: (c) => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 10l6 6h12l6-6 2 14-4 14H14l-4-14z" fill="${c}"/><path d="M24 16h6l6-6 2 14-4 14H24z" fill="#000" opacity=".12"/><circle cx="19" cy="25" r="2.5" fill="#fff"/><circle cx="29" cy="25" r="2.5" fill="#fff"/><path d="M22 31h4l-2 2z" fill="#2b2f3a"/></svg>`,
};

/** What the wardrobe needs from outside. */
export interface WardrobeSource {
  /** The items to show right now. */
  items(): readonly WardrobeItem[];
  /** What the player wears (kept). */
  readonly worn: Look;
  /** The draft to preview while editing. */
  preview(draft: Look): void;
  /** Keeps the draft (sends it to Moodle). */
  keep(draft: Look): void;
}

/** The creator's Wardrobe tab: hats, outfits and pets; locked ones are disabled silhouettes with their unlock sentence. */
export class WardrobeTab implements CreatorTab {
  readonly id = 'wardrobe';
  readonly label: string;
  private draft: Look = NO_LOOK;

  constructor(
    private readonly source: WardrobeSource,
    private readonly strings: WardrobeStrings,
  ) {
    injectStyle('mooblox-wardrobe-style', CSS);
    this.label = strings.wardrobe_tab;
    this.draft = source.worn;
  }

  get current(): Look {
    return this.draft;
  }

  render(into: HTMLElement, changed: () => void): void {
    const items = this.source.items();
    for (const slot of WARDROBE_SLOTS) {
      const group = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'mooblox-creator-label';
      label.id = `mooblox-ward-${slot}`;
      label.textContent = this.strings[`wardrobe_${slot}`];
      const grid = document.createElement('div');
      grid.className = 'mooblox-ward-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-labelledby', label.id);
      grid.appendChild(this.tile(null, slot, this.strings.wardrobe_none, '', true, into, changed));
      for (const item of items.filter((i) => i.slot === slot)) {
        grid.appendChild(this.tile(item.id, slot, item.name, item.hint, item.unlocked, into, changed));
      }
      group.append(label, grid);
      into.appendChild(group);
    }
    this.mark(into);
  }

  commit(): boolean {
    const changed = JSON.stringify(this.draft) !== JSON.stringify(this.source.worn);
    if (changed) this.source.keep(this.draft);
    return changed;
  }

  revert(): void {
    this.draft = this.source.worn;
    this.source.preview(this.draft);
  }

  private tile(id: string | null, slot: WardrobeSlot, name: string, hint: string, unlocked: boolean, panel: HTMLElement, changed: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = id ? 'mooblox-ward-item' : 'mooblox-ward-item mooblox-ward-none';
    b.dataset['slot'] = slot;
    b.dataset['item'] = id ?? '';
    b.innerHTML = id ? ICON[slot](ACCENT[id] ?? '#2fa39a') : '';
    const title = document.createElement('span');
    title.textContent = name;
    b.appendChild(title);
    if (!unlocked) {
      b.disabled = true;
      const lock = document.createElement('span');
      lock.className = 'mooblox-ward-lock';
      lock.innerHTML = LOCK;
      const why = document.createElement('small');
      why.textContent = hint;
      b.append(why, lock);
      b.title = `${name}: ${hint}`;
    } else {
      b.title = name;
      b.addEventListener('click', () => {
        this.draft = toggle(this.draft, slot, id);
        this.source.preview(this.draft);
        this.mark(panel);
        changed();
      });
    }
    return b;
  }

  private mark(panel: HTMLElement): void {
    for (const b of panel.querySelectorAll<HTMLButtonElement>('.mooblox-ward-item')) {
      const slot = b.dataset['slot'] as WardrobeSlot;
      b.setAttribute('aria-pressed', String((this.draft[slot] ?? '') === b.dataset['item']));
    }
  }
}
