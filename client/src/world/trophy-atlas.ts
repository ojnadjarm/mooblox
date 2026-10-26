import { CanvasTexture, SRGBColorSpace } from 'three';
import type { AtlasCell } from './trophy-hall';

/** One atlas entry: a badge (image + name), the "+N" plaque or the empty "?" pedestal. */
export type AtlasEntry =
  | { readonly kind: 'badge'; readonly name: string; readonly imageUrl: string }
  | { readonly kind: 'more'; readonly count: number }
  | { readonly kind: 'empty' };

const SIZE = 1024;
const CW = 128;
const MEDAL = 128;
const STRIP = 32;
const CH = MEDAL + STRIP;
const COLS = SIZE / CW;
/** Cells the atlas holds (8 x 6). */
export const ATLAS_CELLS = COLS * Math.floor(SIZE / CH);
/** Uv of the white patch under the cells (the hall's vertex-coloured parts sample it). */
export const ATLAS_WHITE: readonly [number, number] = [32 / SIZE, 1 - 992 / SIZE];
const FONT = '"Nunito", "Fredoka", "Trebuchet MS", system-ui, sans-serif';

/** The uv rectangles of cell i (canvas y runs down, uv v up: the texture is flipped on upload). */
export function atlasCell(i: number): AtlasCell {
  const x = (i % COLS) * CW;
  const y = Math.floor(i / COLS) * CH;
  const u = (px: number) => px / SIZE;
  const v = (py: number) => 1 - py / SIZE;
  return {
    medal: [u(x + 2), v(y + MEDAL - 2), u(x + MEDAL - 2), v(y + 2)],
    name: [u(x + 2), v(y + CH - 2), u(x + CW - 2), v(y + MEDAL + 2)],
  };
}

/** Every trophy medallion and name plate on one 1024 px canvas texture; badge images draw in as they load. */
export class TrophyAtlas {
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private generation = 0;

  constructor(private readonly changed: () => void) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    // A CPU canvas keeps its pixels when the GPU process resets (a GPU canvas comes back blank).
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Repaints the atlas for these entries (cell i = entry i); late image loads of an older paint are dropped. */
  paint(entries: readonly AtlasEntry[]): void {
    const gen = ++this.generation;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 960, 256, 64);
    entries.slice(0, ATLAS_CELLS).forEach((e, i) => {
      const x = (i % COLS) * CW;
      const y = Math.floor(i / COLS) * CH;
      this.medalBase(x, y, e.kind === 'badge' ? '#ffffff' : '#fff6dc');
      this.strip(x, y, e.kind === 'badge' ? e.name : e.kind === 'more' ? `+${e.count}` : '?');
      if (e.kind === 'badge') {
        this.glyph(x, y, '★', '#f6c445');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (gen !== this.generation) return;
          ctx.save();
          ctx.beginPath();
          ctx.arc(x + MEDAL / 2, y + MEDAL / 2, MEDAL / 2 - 12, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, y, MEDAL, MEDAL);
          ctx.drawImage(img, x + 12, y + 12, MEDAL - 24, MEDAL - 24);
          ctx.restore();
          this.texture.needsUpdate = true;
          this.changed();
        };
        img.src = e.imageUrl;
      } else {
        this.glyph(x, y, e.kind === 'more' ? `+${e.count}` : '?', '#d49a2a');
      }
    });
    this.texture.needsUpdate = true;
    this.changed();
  }

  dispose(): void {
    this.generation++;
    this.texture.dispose();
  }

  private medalBase(x: number, y: number, fill: string): void {
    const ctx = this.ctx;
    const c = MEDAL / 2;
    ctx.fillStyle = '#d49a2a';
    ctx.fillRect(x, y, MEDAL, MEDAL);
    ctx.beginPath();
    ctx.arc(x + c, y + c, c - 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f6c445';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + c, y + c, c - 12, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private glyph(x: number, y: number, text: string, colour: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${text.length > 2 ? 40 : 60}px ${FONT}`;
    ctx.fillText(text, x + MEDAL / 2, y + MEDAL / 2 + 3);
  }

  private strip(x: number, y: number, name: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#f4e6cc';
    ctx.fillRect(x, y + MEDAL, CW, STRIP);
    ctx.fillStyle = '#2b2f3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 20;
    ctx.font = `800 ${size}px ${FONT}`;
    while (size > 11 && ctx.measureText(name).width > CW - 8) ctx.font = `800 ${--size}px ${FONT}`;
    ctx.fillText(name, x + CW / 2, y + MEDAL + STRIP / 2 + 1, CW - 8);
  }
}
