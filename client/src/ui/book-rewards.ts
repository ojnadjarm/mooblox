import type { CollectibleKind } from '../domain/rewards';
import type { Album, QuestRow, TrophyRow } from './book-rewards-model';
import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-bookr { height: 100%; overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box;
  padding: 16px max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left)); font: 700 16px/1.3 ${UI_FONT}; color: #2b2f3a; }
.mooblox-bookr-inner { max-width: 880px; margin: 0 auto; display: grid; gap: 12px; }
.mooblox-bookr-quest { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; grid-template-areas: "icon text count" "icon bar bar" "icon prize prize";
  align-items: center; column-gap: 12px; row-gap: 6px; padding: 12px 14px; border-radius: 18px; background: #fff; border: 3px solid #e3eaf3; }
.mooblox-bookr-quest.is-done { border-color: #5db761; }
.mooblox-bookr-qicon { grid-area: icon; width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: #e0844f; color: #fff;
  box-shadow: inset 0 -4px 0 #b4583a; }
.mooblox-bookr-quest.is-done .mooblox-bookr-qicon { background: #5db761; box-shadow: inset 0 -4px 0 #2f8466; }
.mooblox-bookr-qicon svg { width: 24px; height: 24px; }
.mooblox-bookr-qtext { grid-area: text; min-width: 0; overflow-wrap: anywhere; }
.mooblox-bookr-qcount { grid-area: count; color: #2f7fe0; white-space: nowrap; }
.mooblox-bookr-quest.is-done .mooblox-bookr-qcount { color: #2f8466; }
.mooblox-bookr-track { grid-area: bar; height: 12px; border-radius: 999px; background: #f4e6cc; box-shadow: inset 0 2px 0 #d2bc9a; overflow: hidden; }
.mooblox-bookr-track span { display: block; height: 100%; border-radius: inherit; background: #f6c445; box-shadow: inset 0 -3px 0 #d49a2a; }
.mooblox-bookr-quest.is-done .mooblox-bookr-track span { background: #5db761; box-shadow: inset 0 -3px 0 #2f8466; }
.mooblox-bookr-prize { grid-area: prize; font-size: 14px; font-weight: 700; color: #6a3fb0; }
.mooblox-bookr-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font: 800 18px ${UI_FONT}; }
.mooblox-bookr-head .mooblox-bookr-track { flex: 1 1 160px; }
.mooblox-bookr-page { padding: 12px 14px 14px; border-radius: 18px; background: #fff; border: 3px solid #e3eaf3; }
.mooblox-bookr-page h3 { margin: 0 0 10px; display: flex; gap: 8px; align-items: baseline; font: 800 18px ${UI_FONT}; color: #1e88e5; }
.mooblox-bookr-page h3 small { margin-left: auto; font-size: 14px; color: #5a5f6e; white-space: nowrap; }
.mooblox-bookr-slots { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.mooblox-bookr-slot { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; box-sizing: border-box; }
.mooblox-bookr-slot svg { width: 34px; height: 34px; }
.mooblox-bookr-slot.is-found { background: #f4f0ff; border: 3px solid #d9c6ff; }
.mooblox-bookr-slot.is-found.crystal { background: #e6f8f7; border-color: #9ee3df; }
.mooblox-bookr-slot.is-found.star { background: #fff6dc; border-color: #f6dd8f; }
.mooblox-bookr-slot.is-hidden { border: 3px dashed #c3cfdd; color: #9aa6b8; font: 800 22px ${UI_FONT}; }
.mooblox-bookr-shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.mooblox-bookr-trophy { display: grid; justify-items: center; gap: 6px; padding: 14px 10px 12px; border-radius: 18px; background: #fff;
  border: 3px solid #f6dd8f; text-align: center; }
.mooblox-bookr-trophy img { width: 84px; height: 84px; object-fit: contain; }
.mooblox-bookr-cup svg { display: block; width: 84px; height: 84px; }
.mooblox-bookr-trophy small { color: #5a5f6e; font-size: 13px; font-weight: 700; }
.mooblox-bookr-empty { margin: 24px auto; max-width: 420px; text-align: center; color: #5a5f6e; display: grid; justify-items: center; gap: 10px; }
.mooblox-bookr-empty svg { width: 72px; height: 72px; }
@media (max-width: 480px) { .mooblox-bookr-slot { width: 46px; height: 46px; } .mooblox-bookr-slot svg { width: 30px; height: 30px; }
  .mooblox-bookr-shelf { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6 3h2v18H6z"/><path d="M8 4h11l-3 4 3 4H8z"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CUP =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="#f6c445"/><path d="M32 8h14v14a14 14 0 0 1-14 14z" fill="#d49a2a"/><path d="M18 12H9v4a9 9 0 0 0 9 9M46 12h9v4a9 9 0 0 1-9 9" fill="none" stroke="#d49a2a" stroke-width="4"/><path d="M28 36h8v10h-8z" fill="#d49a2a"/><path d="M20 46h24l3 10H17z" fill="#b97a4a"/><path d="M32 46h12l3 10H32z" fill="#8a5636"/></svg>';

/** Faceted icons of the three collectibles, matching their world models. */
export const KIND_ICON: Record<CollectibleKind, string> = {
  gem: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 6h14l6 8H3z" fill="#a774f0"/><path d="M12 6h8l3 8H9z" fill="#d9c6ff"/><path d="M3 14h26L16 29z" fill="#6a3fb0"/><path d="M9 14h14l-7 15z" fill="#a774f0"/></svg>',
  crystal: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13 27V9l4-6 4 6v18z" fill="#5ed8d2"/><path d="M17 3l4 6v18h-4z" fill="#1fa4c9"/><path d="M6 27v-9l3-4 3 4v9z" fill="#5ed8d2"/><path d="M22 27v-7l3-3 3 3v7z" fill="#1fa4c9"/><path d="M4 29l3-3h18l3 3z" fill="#8e86a3"/></svg>',
  star: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l4.2 9 9.8 1.2-7.2 6.8 1.9 9.8L16 24l-8.7 4.8 1.9-9.8L2 12.2 11.8 11z" fill="#f6c445"/><path d="M16 2l4.2 9 9.8 1.2-7.2 6.8 1.9 9.8L16 24z" fill="#d49a2a"/></svg>',
};

const page = (): [HTMLElement, HTMLElement] => {
  injectStyle('mooblox-book-rewards-style', CSS);
  const root = document.createElement('div');
  root.className = 'mooblox-bookr';
  const inner = document.createElement('div');
  inner.className = 'mooblox-bookr-inner';
  root.appendChild(inner);
  return [root, inner];
};

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

const track = (fraction: number, label: string): HTMLElement => {
  const t = el('div', 'mooblox-bookr-track');
  t.setAttribute('role', 'progressbar');
  t.setAttribute('aria-label', label);
  t.setAttribute('aria-valuemin', '0');
  t.setAttribute('aria-valuemax', '100');
  t.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  const fill = document.createElement('span');
  fill.style.width = `${Math.round(fraction * 100)}%`;
  t.appendChild(fill);
  return t;
};

/** Quests page: one card per quest with its progress bar and the item it unlocks. */
export function renderQuests(rows: readonly QuestRow[]): HTMLElement {
  const [root, inner] = page();
  for (const q of rows) {
    const card = el('section', `mooblox-bookr-quest${q.complete ? ' is-done' : ''}`);
    card.dataset['quest'] = q.id;
    const icon = el('span', 'mooblox-bookr-qicon');
    icon.innerHTML = q.complete ? TICK : FLAG;
    card.append(icon, el('div', 'mooblox-bookr-qtext', q.text), el('div', 'mooblox-bookr-qcount', q.progress), track(q.fraction, q.text));
    if (q.reward) card.appendChild(el('div', 'mooblox-bookr-prize', q.reward));
    inner.appendChild(card);
  }
  return root;
}

/** Collection page: the total, then an album page per district with found items and "?" slots. */
export function renderCollection(a: Album, hidden: string): HTMLElement {
  const [root, inner] = page();
  const head = el('div', 'mooblox-bookr-head');
  head.append(el('span', '', a.label), track(a.total ? a.found / a.total : 0, a.label));
  inner.appendChild(head);
  for (const p of a.pages) {
    const card = el('section', 'mooblox-bookr-page');
    card.dataset['section'] = String(p.sectionId);
    const h = el('h3', '', p.name);
    h.appendChild(el('small', '', `${p.found}/${p.slots.length}`));
    const list = el('ul', 'mooblox-bookr-slots');
    for (const s of p.slots) {
      const li = el('li', `mooblox-bookr-slot ${s.kind} ${s.found ? 'is-found' : 'is-hidden'}`);
      li.dataset['key'] = s.key;
      if (s.found) {
        li.innerHTML = KIND_ICON[s.kind];
        li.setAttribute('aria-label', s.kind);
      } else {
        li.textContent = '?';
        li.setAttribute('aria-label', hidden);
      }
      list.appendChild(li);
    }
    card.append(h, list);
    inner.appendChild(card);
  }
  return root;
}

/** Trophies page: a shelf of earned badges, or a friendly empty shelf. */
export function renderTrophies(rows: readonly TrophyRow[], empty: string): HTMLElement {
  const [root, inner] = page();
  if (!rows.length) {
    const e = el('div', 'mooblox-bookr-empty');
    e.innerHTML = CUP;
    e.appendChild(el('p', '', empty));
    inner.appendChild(e);
    return root;
  }
  const shelf = el('div', 'mooblox-bookr-shelf');
  for (const t of rows) {
    const card = el('figure', 'mooblox-bookr-trophy');
    card.style.margin = '0';
    card.dataset['badge'] = String(t.badgeId);
    const img = document.createElement('img');
    img.src = t.imageUrl;
    img.alt = '';
    img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'mooblox-bookr-cup', innerHTML: CUP })), { once: true });
    card.append(img, el('figcaption', '', t.name), el('small', '', t.earned));
    shelf.appendChild(card);
  }
  inner.appendChild(shelf);
  return root;
}
