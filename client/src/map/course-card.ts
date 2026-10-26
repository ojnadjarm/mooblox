import { injectStyle, UI_FONT } from '../ui/style';
import type { MapCourse } from './courses';
import { progressText, visitText, type MapStrings } from './map-strings';

const CSS = `
.mooblox-map-card { position: absolute; z-index: 20; left: 50%; bottom: max(14px, env(safe-area-inset-bottom)); transform: translateX(-50%);
  box-sizing: border-box; width: min(560px, calc(100% - 24px)); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: center;
  padding: 14px; border-radius: 24px; background: #fff; border: 4px solid #fff; box-shadow: 0 10px 30px rgba(0, 40, 80, .3); color: #23304a;
  font-family: ${UI_FONT}; }
.mooblox-map-card[hidden] { display: none; }
.mooblox-map-card-art { width: 96px; height: 96px; border-radius: 18px; background: #2fa39a center / cover no-repeat; display: grid; place-items: center;
  color: #fff; font: 800 40px ${UI_FONT}; }
.mooblox-map-card h2 { margin: 0 34px 4px 0; font: 800 20px/1.2 ${UI_FONT}; overflow-wrap: anywhere; }
.mooblox-map-card p { margin: 0 0 8px; font: 600 14px/1.35 ${UI_FONT}; color: #5b6475; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; }
.mooblox-map-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font: 700 14px ${UI_FONT}; color: #3b4356; }
.mooblox-map-card-bar { flex: 1 1 120px; height: 10px; border-radius: 999px; background: #e3eaf3; overflow: hidden; }
.mooblox-map-card-bar i { display: block; height: 100%; background: #43b05c; border-radius: 999px; }
.mooblox-map-card-end { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mooblox-map-card-visit { font: 600 13px ${UI_FONT}; color: #6b7385; }
.mooblox-map-play { min-height: 52px; min-width: 140px; padding: 0 26px; border-radius: 999px; border: 4px solid #fff; background: #43b05c; color: #fff;
  font: 800 19px ${UI_FONT}; cursor: pointer; box-shadow: 0 4px 0 #2f8a45; }
.mooblox-map-close { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 50%; border: 0; background: #eef3f9;
  color: #3b4356; font: 800 20px/1 ${UI_FONT}; cursor: pointer; }
.mooblox-map-card button:focus-visible { outline: 3px solid #ffc21a; outline-offset: 2px; }
@media (max-width: 480px) { .mooblox-map-card { gap: 10px; padding: 12px; } .mooblox-map-card-art { width: 64px; height: 64px; font-size: 28px; }
  .mooblox-map-card h2 { font-size: 17px; } .mooblox-map-play { min-width: 110px; } }
`;

/** Accent colours of course art without an image (the island theme order). */
const ART = [0x2fa39a, 0x8bd346, 0xf07a5f, 0xf6c445, 0xe5484d];

/** The card of the picked course: image, name, summary, progress, last visit and Play. */
export class CourseCard {
  readonly element: HTMLElement;
  private index = -1;

  constructor(
    host: HTMLElement,
    private readonly s: MapStrings,
    private readonly play: (index: number) => void,
    close: () => void,
  ) {
    injectStyle('mooblox-map-card-style', CSS);
    this.element = document.createElement('section');
    this.element.className = 'mooblox-map-card';
    this.element.hidden = true;
    this.element.setAttribute('aria-live', 'polite');
    this.element.innerHTML = `<div class="mooblox-map-card-art" aria-hidden="true"></div><div><h2></h2><p></p><div class="mooblox-map-card-meta"></div></div>
      <div class="mooblox-map-card-end"><span class="mooblox-map-card-visit"></span><button type="button" class="mooblox-map-play"></button></div>
      <button type="button" class="mooblox-map-close">×</button>`;
    const playButton = this.element.querySelector<HTMLButtonElement>('.mooblox-map-play')!;
    playButton.textContent = s.map_play;
    playButton.addEventListener('click', () => this.index >= 0 && this.play(this.index));
    const x = this.element.querySelector<HTMLButtonElement>('.mooblox-map-close')!;
    x.setAttribute('aria-label', s.map_close);
    x.addEventListener('click', close);
    host.appendChild(this.element);
  }

  get shown(): number {
    return this.element.hidden ? -1 : this.index;
  }

  show(c: MapCourse, index: number, now = Date.now() / 1000): void {
    this.index = index;
    const art = this.element.querySelector<HTMLElement>('.mooblox-map-card-art')!;
    art.style.backgroundColor = `#${ART[index % ART.length]!.toString(16).padStart(6, '0')}`;
    art.style.backgroundImage = c.image ? `url("${encodeURI(c.image)}")` : '';
    art.textContent = c.image ? '' : (Array.from(c.fullname.trim())[0] ?? '?').toUpperCase();
    this.element.querySelector('h2')!.textContent = c.fullname;
    const summary = this.element.querySelector('p')!;
    summary.textContent = c.summary;
    summary.hidden = c.summary === '';
    const meta = this.element.querySelector('.mooblox-map-card-meta')!;
    meta.textContent = '';
    if (!c.completed && c.progress >= 0) {
      const bar = document.createElement('span');
      bar.className = 'mooblox-map-card-bar';
      bar.innerHTML = `<i style="width:${Math.max(0, Math.min(100, c.progress))}%"></i>`;
      meta.appendChild(bar);
    }
    meta.append(progressText(this.s, c.progress, c.completed));
    this.element.querySelector('.mooblox-map-card-visit')!.textContent = visitText(this.s, c.lastaccess, now, document.documentElement.lang || undefined);
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
    this.index = -1;
  }
}
