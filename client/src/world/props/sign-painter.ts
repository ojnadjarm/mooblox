import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { Activity } from '../../domain/types';
import { Palette, PurposeColor } from '../palette';
import type { SignPainter } from './prop';

/** Width over height of every name sign. */
export const SIGN_ASPECT = 3;

const H = 192;
const W = H * SIGN_ASPECT;
const PAD = 18;
const FONT = '"Nunito", "Fredoka", "Trebuchet MS", system-ui, sans-serif';

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** Draws the module icon on a purpose-coloured tile and the activity name, on a 2D canvas. */
export class CanvasSignPainter implements SignPainter {
  constructor(private readonly changed: () => void) {}

  paint(a: Activity): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const tile = H - PAD * 2;
    const color = css(PurposeColor[a.purpose] ?? Palette.pink);
    ctx.fillStyle = css(Palette.white);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    roundRect(ctx, PAD, PAD, tile, tile, 26);
    ctx.fill();
    ctx.fillStyle = css(Palette.ink);
    text(ctx, a.name, PAD * 2 + tile, W - PAD * 2 - tile, H);
    if (a.iconUrl) {
      const img = new Image();
      img.onload = () => {
        const inset = tile * 0.2;
        ctx.drawImage(whiteIcon(img, tile - inset * 2), PAD + inset, PAD + inset);
        texture.needsUpdate = true;
        this.changed();
      };
      img.src = a.iconUrl;
    }
    return texture;
  }
}

/** The icon's shape filled white, so it reads on any tile colour. */
function whiteIcon(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
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
