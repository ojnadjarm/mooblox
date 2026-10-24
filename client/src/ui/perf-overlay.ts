import type { WebGLRenderer } from 'three';
import type { QualityManager } from '../perf/quality-manager';
import { TIERS } from '../perf/quality';

const REFRESH_MS = 500;
const CSS = `
.mooblox-perf { position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  max-width: calc(100% - 16px); box-sizing: border-box; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 10px;
  padding: 6px 10px; border-radius: 12px; background: rgba(10,30,60,.72); color: #fff;
  font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; pointer-events: auto; }
.mooblox-perf button { font: inherit; color: #fff; background: rgba(255,255,255,.15); border: 0; border-radius: 8px; padding: 2px 8px; cursor: pointer; }
.mooblox-perf button[aria-pressed="true"] { background: #1e88e5; }
`;

/** `?perf=1` overlay: fps, draw calls, triangles, shader programs, pixel ratio and tier buttons. */
export class PerfOverlay {
  readonly element = document.createElement('div');
  private frames = 0;
  private since = performance.now();

  constructor(
    host: HTMLElement,
    private readonly renderer: WebGLRenderer,
    private readonly quality: QualityManager,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.element.className = 'mooblox-perf';
    this.element.innerHTML = `<span data-k="fps"></span><span data-k="calls"></span><span data-k="tris"></span>
      <span data-k="programs"></span><span data-k="dpr"></span>${TIERS.map((t) => `<button type="button" data-tier="${t}">${t}</button>`).join('')}`;
    this.element.addEventListener('click', (e) => {
      const tier = (e.target as HTMLElement).dataset['tier'];
      if (tier) {
        this.quality.setTier(tier as (typeof TIERS)[number]);
        this.refresh(0);
      }
    });
    host.appendChild(this.element);
    this.refresh(0);
  }

  /** Counts a rendered frame; refreshes the numbers twice a second. */
  frame(): void {
    this.frames++;
    const now = performance.now();
    if (now - this.since >= REFRESH_MS) {
      this.refresh((this.frames * 1000) / (now - this.since));
      this.frames = 0;
      this.since = now;
    }
  }

  private refresh(fps: number): void {
    const info = this.renderer.info;
    this.set('fps', `${fps.toFixed(0)} fps`);
    this.set('calls', `${info.render.calls} calls`);
    this.set('tris', `${(info.render.triangles / 1000).toFixed(1)}k tris`);
    this.set('programs', `${info.programs?.length ?? 0} programs`);
    this.set('dpr', `dpr ${this.renderer.getPixelRatio().toFixed(2)}`);
    for (const b of this.element.querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-pressed', String(b.dataset['tier'] === this.quality.tier));
    }
  }

  private set(key: string, text: string): void {
    this.element.querySelector(`[data-k="${key}"]`)!.textContent = text;
  }
}
