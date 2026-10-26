import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { Activity } from '../../domain/types';
import { Palette, PurposeColor } from '../palette';
import type { FrameBudget } from '../../perf/frame-budget';
import type { SignPainter } from './prop';

/** Width over height of every name sign. */
export const SIGN_ASPECT = 3;

const H = 192;
const W = H * SIGN_ASPECT;
const PAD = 18;
const FONT = '"Nunito", "Fredoka", "Trebuchet MS", system-ui, sans-serif';

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

interface Sign {
  readonly a: Activity;
  readonly texture: CanvasTexture;
  painted: boolean;
  queued: boolean;
  /** Bumped on every release: an icon that loads after one is not drawn. */
  gen: number;
}

/** Paints name signs (icon tile + activity name) on 2D canvases; `lazy` signs hold pixels only while wanted (painted in budget slices). */
export class CanvasSignPainter implements SignPainter {
  private readonly signs = new Map<Texture, Sign>();
  private readonly queue: Sign[] = [];
  private readonly icons = new Map<string, Promise<HTMLCanvasElement>>();

  constructor(
    private readonly changed: () => void,
    private readonly lazy = false,
  ) {}

  paint(a: Activity): Texture {
    const canvas = document.createElement('canvas');
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const sign: Sign = { a, texture, painted: false, queued: false, gen: 0 };
    this.signs.set(texture, sign);
    blank(canvas);
    if (!this.lazy) this.draw(sign);
    return texture;
  }

  want(texture: Texture): void {
    const sign = this.signs.get(texture);
    if (!sign || sign.painted || sign.queued) return;
    sign.queued = true;
    this.queue.push(sign);
  }

  release(texture: Texture): void {
    const sign = this.signs.get(texture);
    if (!this.lazy || !sign) return;
    sign.queued = false;
    if (!sign.painted) return;
    sign.painted = false;
    sign.gen++;
    blank(sign.texture.image as HTMLCanvasElement);
    sign.texture.dispose();
  }

  forget(texture: Texture): void {
    const sign = this.signs.get(texture);
    if (!sign) return;
    sign.queued = false;
    sign.gen++;
    this.signs.delete(texture);
    texture.dispose();
  }

  /** Signs wanted and not painted yet. */
  get pending(): number {
    return this.queue.filter((s) => s.queued).length;
  }

  /** Paints wanted signs while the budget lasts; true when one was painted. */
  step(budget: FrameBudget): boolean {
    let any = false;
    budget.run(() => {
      let sign = this.queue.shift();
      while (sign && !sign.queued) sign = this.queue.shift();
      if (sign) {
        sign.queued = false;
        this.draw(sign);
        any = true;
      }
      return this.queue.length === 0;
    });
    return any;
  }

  private draw(sign: Sign): void {
    const { a, texture } = sign;
    const canvas = texture.image as HTMLCanvasElement;
    // A board drawn while blank was uploaded at 1 x 1: free it so the full size is allocated.
    texture.dispose();
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const tile = H - PAD * 2;
    const color = css(PurposeColor[a.purpose] ?? Palette.pink);
    ctx.fillStyle = css(Palette.white);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    roundRect(ctx, PAD, PAD, tile, tile, 26);
    ctx.fill();
    ctx.fillStyle = css(Palette.ink);
    text(ctx, a.name, PAD * 2 + tile, W - PAD * 2 - tile, H);
    texture.needsUpdate = true;
    sign.painted = true;
    if (a.iconUrl) {
      const inset = tile * 0.2;
      const gen = sign.gen;
      this.icon(a.iconUrl, tile - inset * 2).then(
        (icon) => {
          if (sign.gen !== gen || !sign.painted) return;
          ctx.drawImage(icon, PAD + inset, PAD + inset);
          texture.needsUpdate = true;
          this.changed();
        },
        () => undefined,
      );
    }
  }

  /** The white icon for `url`, loaded once per sign painter. */
  private icon(url: string, size: number): Promise<HTMLCanvasElement> {
    let icon = this.icons.get(url);
    if (!icon) {
      icon = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(whiteIcon(img, size));
        img.onerror = reject;
        img.src = url;
      });
      this.icons.set(url, icon);
    }
    return icon;
  }
}

/** A 1 x 1 white board: an unpainted sign holds no pixels. */
function blank(canvas: HTMLCanvasElement): void {
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = css(Palette.white);
  ctx.fillRect(0, 0, 1, 1);
}

/** The icon's shape filled white, so it reads on any tile colour. */
function whiteIcon(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  // Cached for every sign: a CPU canvas keeps its pixels when the GPU process resets.
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Up to two lines of bold text, shrunk then cut with an ellipsis to fit. */
function text(ctx: CanvasRenderingContext2D, value: string, x: number, width: number, height: number): void {
  let size = 64;
  let lines: string[] = [];
  for (; ; size -= 6) {
    ctx.font = `800 ${size}px ${FONT}`;
    lines = wrap(ctx, value, width);
    if (lines.length <= 2 || size <= 40) {
      break;
    }
  }
  const cut = lines.length > 2;
  lines = lines.slice(0, 2);
  const last = lines.length - 1;
  if (cut) {
    lines[last] += '…';
  }
  while (ctx.measureText(lines[last]!).width > width && lines[last]!.length > 1) {
    lines[last] = `${lines[last]!.slice(0, -2)}…`;
  }
  ctx.textBaseline = 'middle';
  const lineH = size * 1.1;
  const top = height / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineH));
}

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
