import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import { injectStyle, UI_FONT } from '../ui/style';
import type { MapCourse } from './courses';
import { progressText, type MapStrings } from './map-strings';

const CSS = `
.mooblox-map-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 5; }
.mooblox-map-label { position: absolute; left: 0; top: 0; pointer-events: auto; display: inline-flex; align-items: center; gap: 6px; max-width: 200px;
  min-height: 44px; padding: 3px 14px 3px 3px; border-radius: 999px; border: 3px solid #fff; background: rgba(255, 255, 255, .92); color: #23304a;
  font: 800 15px/1.15 ${UI_FONT}; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 40, 80, .25); white-space: nowrap; will-change: transform; }
.mooblox-map-label span { overflow: hidden; text-overflow: ellipsis; }
.mooblox-map-label svg { flex: none; width: 34px; height: 34px; }
.mooblox-map-label.is-compact { padding-right: 3px; }
.mooblox-map-label.is-compact span { display: none; }
.mooblox-map-label[aria-current="true"] { background: #ffc21a; border-color: #fff; z-index: 2; }
.mooblox-map-label:focus-visible { outline: 3px solid #1e88e5; outline-offset: 2px; }
@media (max-width: 480px) { .mooblox-map-label { max-width: 150px; font-size: 14px; } }
`;

const RING = 13;
const ARC = 2 * Math.PI * RING;

/** The badge at the start of a label: a gold cup when finished, a progress ring when tracked, else a compass. */
function badge(c: MapCourse): string {
  if (c.completed) {
    return `<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="#ffd54a"/><path d="M11 9h12v4a6 6 0 0 1-12 0zM9 10h2v3a2 2 0 0 1-2-2zM25 10h-2v3a2 2 0 0 0 2-2zM15 19h4v4h3v3h-10v-3h3z" fill="#b8741a"/></svg>`;
  }
  if (c.progress < 0) {
    return `<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="#e3f1ff"/><path d="M17 7l3 10-3 10-3-10z" fill="#1e88e5"/><path d="M17 17l3 0-3 10z" fill="#e5484d"/></svg>`;
  }
  const done = (Math.max(0, Math.min(100, c.progress)) / 100) * ARC;
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="#fff"/><circle cx="17" cy="17" r="${RING}" fill="none" stroke="#dfe7f1" stroke-width="5"/>`
    + `<circle cx="17" cy="17" r="${RING}" fill="none" stroke="#43b05c" stroke-width="5" stroke-linecap="round" stroke-dasharray="${done.toFixed(1)} ${ARC.toFixed(1)}" transform="rotate(-90 17 17)"/>`
    + `<text x="17" y="21" text-anchor="middle" font-size="11" font-weight="800" fill="#23304a">${c.progress}</text></svg>`;
}

/** What a label tells the map. */
export interface LabelEvents {
  /** Hover, focus or a first tap on a course. */
  select(index: number): void;
  /** A click, a second tap or Enter on a course. */
  enter(index: number): void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** One button per island over the canvas (name, progress ring or trophy), kept on its island; crowded labels fold to the ring. */
export class IslandLabels {
  readonly element: HTMLElement;
  readonly buttons: HTMLButtonElement[];
  private readonly at = new Vector3();
  private sizes: { full: [number, number]; compact: [number, number] }[] = [];
  private touch = false;

  constructor(
    host: HTMLElement,
    courses: readonly MapCourse[],
    s: MapStrings,
    private readonly selected: () => number,
    events: LabelEvents,
  ) {
    injectStyle('mooblox-map-labels-style', CSS);
    this.element = document.createElement('div');
    this.element.className = 'mooblox-map-labels';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', s.map_list);
    this.buttons = courses.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mooblox-map-label';
      b.innerHTML = `${badge(c)}<span></span>`;
      b.querySelector('span')!.textContent = c.fullname;
      b.setAttribute('aria-label', `${c.fullname}, ${progressText(s, c.progress, c.completed)}`);
      b.addEventListener('pointerdown', (e) => {
        this.touch = e.pointerType !== 'mouse' && this.selected() !== i;
      });
      b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && events.select(i));
      b.addEventListener('focus', () => events.select(i));
      b.addEventListener('click', () => {
        const first = this.touch;
        this.touch = false;
        if (first) events.select(i);
        else events.enter(i);
      });
      this.element.appendChild(b);
      return b;
    });
    host.appendChild(this.element);
  }

  /** Measures every label's full and folded size (call after a resize). */
  measure(): void {
    this.sizes = this.buttons.map((b) => {
      b.classList.remove('is-compact');
      const full: [number, number] = [b.offsetWidth, b.offsetHeight];
      b.classList.add('is-compact');
      const compact: [number, number] = [b.offsetWidth, b.offsetHeight];
      return { full, compact };
    });
  }

  /** Moves each label over its anchor; the selected one and earlier courses keep their names when labels would overlap. */
  place(camera: PerspectiveCamera, anchors: readonly { x: number; y: number; z: number }[], width: number, height: number): void {
    if (this.sizes.length !== this.buttons.length) this.measure();
    const sel = this.selected();
    const order = this.buttons.map((_, i) => i);
    if (sel >= 0) order.sort((a, b) => (a === sel ? -1 : b === sel ? 1 : a - b));
    const placed: Box[] = [];
    for (const i of order) {
      const b = this.buttons[i]!;
      const a = anchors[i]!;
      this.at.set(a.x, a.y, a.z).project(camera);
      const sx = (this.at.x * 0.5 + 0.5) * width;
      const sy = (-this.at.y * 0.5 + 0.5) * height;
      const visible = this.at.z < 1 && sx > -100 && sx < width + 100 && sy > -60 && sy < height + 60;
      b.hidden = !visible;
      b.setAttribute('aria-current', i === sel ? 'true' : 'false');
      if (!visible) continue;
      const size = this.sizes[i]!;
      const full: Box = { x: sx - size.full[0] / 2, y: sy - size.full[1], w: size.full[0], h: size.full[1] };
      const fold = i !== sel && placed.some((p) => overlaps(p, full));
      const [w, h] = fold ? size.compact : size.full;
      const box = { x: sx - w / 2, y: sy - h, w, h };
      b.classList.toggle('is-compact', fold);
      placed.push(box);
      b.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
    }
  }
}
