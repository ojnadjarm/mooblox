import { CanvasTexture, SRGBColorSpace } from 'three';
import { UI_FONT } from '../ui/style';

/** What one sign shows. A blank cell draws nothing (alpha-tested away). */
export type SignEntry =
  | {
      readonly kind: 'pad';
      readonly name: string;
      readonly status: string;
      /** 0..1 done, -1 when not tracked. */
      readonly progress: number;
      readonly completed: boolean;
      readonly isNew: string;
      readonly gems: string;
      readonly trophies: number;
    }
  | { readonly kind: 'display'; readonly title: string; readonly value: string; readonly sub: string }
  | { readonly kind: 'number'; readonly value: string }
  | { readonly kind: 'blank' };

export const CELL_W = 512;
export const CELL_H = 256;
const COLS = 2;
export const SIGN_CELLS = 10;
const W = CELL_W * COLS;
const H = CELL_H * (SIGN_CELLS / COLS);

const INK = '#2b2f3a';
const CREAM = '#f6ead3';
const TEAL = '#2fa39a';
const GOLD = '#ffc21a';
const GREEN = '#5cc76a';

/** Uv rectangle [u0, v0, u1, v1] of cell i (canvas y runs down, uv v up). */
export function signCell(i: number): readonly [number, number, number, number] {
  const x = (i % COLS) * CELL_W;
  const y = Math.floor(i / COLS) * CELL_H;
  return [x / W, 1 - (y + CELL_H) / H, (x + CELL_W) / W, 1 - y / H];
}

/** Every hub sign on one canvas texture. */
export class SignAtlas {
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Repaints the cells from `entries` (index = cell). */
  paint(entries: readonly SignEntry[]): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    entries.forEach((e, i) => {
      c.save();
      c.translate((i % COLS) * CELL_W, Math.floor(i / COLS) * CELL_H);
      if (e.kind === 'pad') this.pad(e);
      else if (e.kind === 'display') this.display(e);
      else if (e.kind === 'number') this.number(e.value);
      c.restore();
    });
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }

  private panel(fill: string, border: string): void {
    const c = this.ctx;
    c.beginPath();
    c.roundRect(10, 10, CELL_W - 20, CELL_H - 20, 34);
    c.fillStyle = border;
    c.fill();
    c.beginPath();
    c.roundRect(22, 22, CELL_W - 44, CELL_H - 44, 24);
    c.fillStyle = fill;
    c.fill();
  }

  private pad(e: Extract<SignEntry, { kind: 'pad' }>): void {
    const c = this.ctx;
    this.panel(CREAM, e.completed ? GOLD : TEAL);
    c.fillStyle = INK;
    c.textBaseline = 'alphabetic';
    const lines = wrap(c, e.name, CELL_W - 90, 46, 2);
    lines.text.forEach((line, k) => {
      c.font = `900 ${lines.size}px ${UI_FONT}`;
      c.fillText(line, 46, 76 + k * (lines.size + 4));
    });
    const barY = 140;
    c.beginPath();
    c.roundRect(46, barY, CELL_W - 92, 36, 18);
    c.fillStyle = '#dcccb0';
    c.fill();
    if (e.progress > 0) {
      c.beginPath();
      c.roundRect(46, barY, Math.max(36, (CELL_W - 92) * Math.min(1, e.progress)), 36, 18);
      c.fillStyle = e.completed ? GOLD : GREEN;
      c.fill();
    }
    c.font = `900 28px ${UI_FONT}`;
    c.fillStyle = INK;
    c.textAlign = 'center';
    c.fillText(e.status, CELL_W / 2, barY + 28);
    c.textAlign = 'left';
    c.font = `900 38px ${UI_FONT}`;
    gemIcon(c, 64, 214, 19);
    c.fillStyle = INK;
    c.fillText(e.gems, 92, 227);
    cupIcon(c, 300, 212, 19);
    c.fillStyle = INK;
    c.fillText(String(e.trophies), 330, 227);
    if (e.isNew) {
      c.font = `900 26px ${UI_FONT}`;
      const w = c.measureText(e.isNew).width + 28;
      c.beginPath();
      c.roundRect(CELL_W - 30 - w, 2, w, 40, 20);
      c.fillStyle = '#ff6b8a';
      c.fill();
      c.fillStyle = '#fff';
      c.fillText(e.isNew, CELL_W - 16 - w, 32);
    }
  }

  /** The lift's floor number: a white numeral on a teal disc with a cream rim, centred in the cell. */
  private number(value: string): void {
    const c = this.ctx;
    const r = CELL_H / 2 - 6;
    c.beginPath();
    c.arc(CELL_W / 2, CELL_H / 2, r, 0, Math.PI * 2);
    c.fillStyle = CREAM;
    c.fill();
    c.beginPath();
    c.arc(CELL_W / 2, CELL_H / 2, r - 16, 0, Math.PI * 2);
    c.fillStyle = TEAL;
    c.fill();
    const fit = wrap(c, value, r * 1.5, 170, 1);
    c.font = `900 ${fit.size}px ${UI_FONT}`;
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(fit.text[0] ?? '', CELL_W / 2, CELL_H / 2 + 8);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }

  private display(e: Extract<SignEntry, { kind: 'display' }>): void {
    const c = this.ctx;
    this.panel(CREAM, TEAL);
    c.textAlign = 'center';
    c.fillStyle = TEAL;
    c.font = `900 50px ${UI_FONT}`;
    c.fillText(e.title, CELL_W / 2, 78);
    c.fillStyle = INK;
    const fit = wrap(c, e.value, CELL_W - 80, 92, 1);
    c.font = `900 ${fit.size}px ${UI_FONT}`;
    c.fillText(fit.text[0] ?? '', CELL_W / 2, e.sub ? 166 : 182);
    if (e.sub) {
      c.font = `900 34px ${UI_FONT}`;
      c.fillStyle = '#6b5a45';
      c.fillText(e.sub, CELL_W / 2, 214);
    }
    c.textAlign = 'left';
  }
}

/** Splits `text` into at most `max` lines that fit `width`, shrinking the font from `size` down to 60 % before an ellipsis. */
function wrap(c: CanvasRenderingContext2D, text: string, width: number, size: number, max: number): { text: string[]; size: number } {
  for (let s = size; ; s -= 2) {
    c.font = `900 ${s}px ${UI_FONT}`;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (c.measureText(next).width <= width || !line) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    const fits = lines.length <= max && lines.every((l) => c.measureText(l).width <= width);
    if (fits || s <= size * 0.6) {
      const kept = lines.slice(0, max);
      if (!fits) {
        let last = kept[max - 1] ?? '';
        while (last.length > 1 && c.measureText(`${last}…`).width > width) last = last.slice(0, -1);
        kept[max - 1] = `${last}…`;
      }
      return { text: kept, size: s };
    }
  }
}

/** A cut gem: crown and pavilion facets. */
function gemIcon(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.moveTo(x - r, y - r * 0.35);
  c.lineTo(x - r * 0.55, y - r);
  c.lineTo(x + r * 0.55, y - r);
  c.lineTo(x + r, y - r * 0.35);
  c.lineTo(x, y + r);
  c.closePath();
  c.fillStyle = '#4fc3ff';
  c.fill();
  c.beginPath();
  c.moveTo(x - r, y - r * 0.35);
  c.lineTo(x + r, y - r * 0.35);
  c.lineTo(x, y + r);
  c.closePath();
  c.fillStyle = '#2a8fd6';
  c.fill();
}

/** A loving cup on a foot. */
function cupIcon(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.fillStyle = GOLD;
  c.beginPath();
  c.moveTo(x - r, y - r);
  c.lineTo(x + r, y - r);
  c.quadraticCurveTo(x + r, y + r * 0.3, x, y + r * 0.4);
  c.quadraticCurveTo(x - r, y + r * 0.3, x - r, y - r);
  c.fill();
  c.fillRect(x - r * 0.18, y + r * 0.3, r * 0.36, r * 0.5);
  c.fillRect(x - r * 0.6, y + r * 0.75, r * 1.2, r * 0.3);
  c.strokeStyle = GOLD;
  c.lineWidth = r * 0.22;
  c.beginPath();
  c.arc(x - r, y - r * 0.4, r * 0.4, Math.PI * 0.5, Math.PI * 1.5);
  c.stroke();
  c.beginPath();
  c.arc(x + r, y - r * 0.4, r * 0.4, -Math.PI * 0.5, Math.PI * 0.5);
  c.stroke();
}
