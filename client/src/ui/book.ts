import type { WorldData } from '../domain/types';
import { Palette, PurposeColor } from '../world/palette';
import { bookModel, type BookRow } from './book-model';
import { htmlToText, injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-book { height: 100%; overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box;
  padding: 16px max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left)); font: 700 16px/1.3 ${UI_FONT}; }
.mooblox-book-inner { max-width: 880px; margin: 0 auto; display: grid; gap: 18px; }
.mooblox-book-progress { display: flex; align-items: center; gap: 12px; }
.mooblox-book-bar { flex: 1; height: 16px; border-radius: 999px; background: #dde6f0; overflow: hidden; }
.mooblox-book-bar span { display: block; height: 100%; background: #2fbf4a; border-radius: inherit; }
.mooblox-book-section h3 { margin: 0 0 8px; font: 800 20px ${UI_FONT}; color: #1e88e5; }
.mooblox-book-section ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.mooblox-book-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 12px; border-radius: 16px;
  background: #fff; border: 3px solid #e3eaf3; }
.mooblox-book-row.done { border-color: #2fbf4a; }
.mooblox-book-row.locked { background: #f1f1f3; color: #6e6d72; }
.mooblox-book-icon { flex: none; width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; }
.mooblox-book-icon img { width: 26px; height: 26px; filter: brightness(0) invert(1); }
.mooblox-book-main { flex: 1 1 180px; min-width: 0; }
.mooblox-book-name { overflow-wrap: anywhere; }
.mooblox-book-meta { font-weight: 600; font-size: 14px; color: #5b6475; margin-top: 2px; }
.mooblox-book-end { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.mooblox-book-state { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.mooblox-book-state.done { background: #2fbf4a; color: #fff; }
.mooblox-book-state.todo { border: 3px solid #c3cfdd; box-sizing: border-box; }
.mooblox-book-state.locked { background: #6e6d72; color: #fff; }
.mooblox-book-state svg { width: 18px; height: 18px; }
.mooblox-book-go { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 0; background: #1e88e5; color: #fff;
  font: 800 16px ${UI_FONT}; cursor: pointer; white-space: nowrap; }
.mooblox-book-go:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-book-go:disabled { background: #c9c8cc; color: #4a4950; cursor: not-allowed; }
.mooblox-book-lock { display: flex; align-items: center; gap: 6px; color: #8a3b12; }
.mooblox-book-lock svg { width: 18px; height: 18px; flex: none; }
.mooblox-hud-book { position: absolute; z-index: 10; top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left));
  height: 52px; padding: 0 16px 0 12px; border-radius: 999px; border: 4px solid #fff; background: #1e88e5; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px; font: 800 17px ${UI_FONT}; box-shadow: 0 4px 14px rgba(0, 40, 80, .3); }
.mooblox-hud-book svg { width: 26px; height: 26px; }
.mooblox-hud-book kbd { font: inherit; font-size: 14px; background: rgba(255, 255, 255, .25); border-radius: 6px; padding: 0 6px; }
@media (pointer: coarse) { .mooblox-hud-book kbd { display: none; } }
.mooblox-book-tabbed { display: flex; flex-direction: column; height: 100%; }
.mooblox-book-tabs { flex: none; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; justify-content: safe center;
  padding: 12px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left)); background: #fff; border-bottom: 3px solid #e3eaf3; }
.mooblox-book-tab { flex: none; min-height: 44px; padding: 0 18px; border-radius: 999px; border: 3px solid #e3eaf3; background: #fff;
  color: #2b2f3a; font: 800 16px ${UI_FONT}; cursor: pointer; }
.mooblox-book-tab[aria-selected="true"] { background: #1e88e5; border-color: #1e88e5; color: #fff; }
.mooblox-book-tab:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
.mooblox-book-page { flex: 1; min-height: 0; }
@media (max-width: 480px) { .mooblox-book-tabs { gap: 6px; padding-left: 10px; padding-right: 10px; } .mooblox-book-tab { padding: 0 10px; font-size: 14px; } }
`;

const ICONS = {
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  locked: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z"/><path d="M12 6v13.5"/></svg>',
};

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** The course book: sections, activities with icons, ticks, dates and locks, and a "Go there" per activity. */
export function renderBook(world: WorldData, go: (activityId: number) => void): HTMLElement {
  injectStyle('mooblox-book-style', CSS);
  const model = bookModel(world);
  const root = document.createElement('div');
  root.className = 'mooblox-book';
  const inner = document.createElement('div');
  inner.className = 'mooblox-book-inner';
  root.appendChild(inner);
  const progress = document.createElement('div');
  progress.className = 'mooblox-book-progress';
  const pct = model.total ? Math.round((model.done / model.total) * 100) : 0;
  progress.innerHTML = `<div class="mooblox-book-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${model.total}"
    aria-valuenow="${model.done}"><span style="width:${pct}%"></span></div><span></span>`;
  progress.lastElementChild!.textContent = `${model.done} / ${model.total} done`;
  inner.appendChild(progress);
  for (const section of model.sections) {
    const block = document.createElement('section');
    block.className = 'mooblox-book-section';
    const h = document.createElement('h3');
    h.textContent = section.name;
    block.appendChild(h);
    if (section.lockedInfo) {
      const p = document.createElement('p');
      p.className = 'mooblox-book-meta mooblox-book-lock';
      p.innerHTML = ICONS.locked;
      p.append(htmlToText(section.lockedInfo));
      block.appendChild(p);
    }
    const list = document.createElement('ul');
    for (const r of section.rows) {
      list.appendChild(bookRow(r, go));
    }
    block.appendChild(list);
    inner.appendChild(block);
  }
  return root;
}

function bookRow(r: BookRow, go: (activityId: number) => void): HTMLElement {
  const li = document.createElement('li');
  li.className = `mooblox-book-row ${r.status}`;
  li.dataset['cmid'] = String(r.id);
  const icon = document.createElement('span');
  icon.className = 'mooblox-book-icon';
  icon.style.background = css(r.status === 'locked' ? Palette.stoneDark : PurposeColor[r.purpose] ?? Palette.pink);
  if (r.iconUrl) {
    const img = document.createElement('img');
    img.src = r.iconUrl;
    img.alt = '';
    icon.appendChild(img);
  }
  const main = document.createElement('div');
  main.className = 'mooblox-book-main';
  const name = document.createElement('div');
  name.className = 'mooblox-book-name';
  name.textContent = r.name;
  main.appendChild(name);
  const meta = [
    ...r.dates.map((d) => `${d.label} ${dateFormat.format(new Date(d.timestamp * 1000))}`),
    ...(r.status === 'locked' ? [htmlToText(r.lockedInfo)] : []),
  ];
  if (meta.length) {
    const m = document.createElement('div');
    m.className = 'mooblox-book-meta';
    m.textContent = meta.join(' · ');
    main.appendChild(m);
  }
  const end = document.createElement('div');
  end.className = 'mooblox-book-end';
  if (r.status !== 'untracked') {
    const state = document.createElement('span');
    state.className = `mooblox-book-state ${r.status}`;
    state.innerHTML = r.status === 'done' ? ICONS.done : r.status === 'locked' ? ICONS.locked : '';
    state.setAttribute('aria-label', r.status === 'done' ? 'Done' : r.status === 'locked' ? 'Locked' : 'Not done yet');
    end.appendChild(state);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mooblox-book-go';
  button.textContent = r.status === 'locked' ? 'Locked' : 'Go there';
  button.disabled = r.status === 'locked';
  button.addEventListener('click', () => go(r.id));
  end.appendChild(button);
  li.append(icon, main, end);
  return li;
}

/** Pages behind a row of tabs (arrow keys move between tabs); `selected` is shown first. */
export function bookTabs(pages: readonly { readonly id: string; readonly label: string; render(): HTMLElement }[], selected: string): HTMLElement {
  injectStyle('mooblox-book-style', CSS);
  const root = document.createElement('div');
  root.className = 'mooblox-book-tabbed';
  const bar = document.createElement('div');
  bar.className = 'mooblox-book-tabs';
  bar.setAttribute('role', 'tablist');
  const body = document.createElement('div');
  body.className = 'mooblox-book-page';
  body.setAttribute('role', 'tabpanel');
  const tabs = pages.map((p) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'mooblox-book-tab';
    t.setAttribute('role', 'tab');
    t.dataset['page'] = p.id;
    t.textContent = p.label;
    t.addEventListener('click', () => show(p.id));
    return t;
  });
  const show = (id: string): void => {
    const page = pages.find((p) => p.id === id) ?? pages[0]!;
    tabs.forEach((t) => {
      const on = t.dataset['page'] === page.id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    body.replaceChildren(page.render());
  };
  bar.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    next.focus();
    show(next.dataset['page']!);
  });
  bar.append(...tabs);
  root.append(bar, body);
  show(selected);
  return root;
}

/** The round "Book" button in the top-left corner. */
export function bookButton(host: HTMLElement, onClick: () => void): HTMLButtonElement {
  injectStyle('mooblox-book-style', CSS);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mooblox-hud-book';
  b.innerHTML = `${ICONS.book}<span>Book</span><kbd>B</kbd>`;
  b.addEventListener('click', onClick);
  host.appendChild(b);
  return b;
}
