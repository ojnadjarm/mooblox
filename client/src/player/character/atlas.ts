import { OPTIONS } from './catalog';

/** Side of the shared face atlas, in pixels. */
export const ATLAS_SIZE = 512;

/** Pixel rectangle of a tile: x, y (top-left origin), width, height. */
export type TileRect = readonly [number, number, number, number];

function layout(): Record<string, TileRect> {
  const tiles: Record<string, TileRect> = { solid: [448, 0, 64, 64], blush: [448, 64, 64, 32] };
  OPTIONS.eyes.forEach((s, i) => {
    tiles[`eye-${s}`] = [i * 64, 0, 64, 64];
    tiles[`hl-${s}`] = [i * 64, 64, 64, 64];
  });
  OPTIONS.brows.forEach((s, i) => (tiles[`brow-${s}`] = [i * 64, 128, 64, 26]));
  OPTIONS.mouth.forEach((s, i) => (tiles[`mouth-${s}`] = [i * 64, 160, 64, 32]));
  OPTIONS.glasses.filter((s) => s !== 'none').forEach((s, i) => (tiles[`glasses-${s}`] = [(i % 2) * 192, 200 + Math.floor(i / 2) * 72, 192, 72]));
  return tiles;
}

/** Every tile of the atlas by id (`solid`, `blush`, `eye-<shape>`, `hl-<shape>`, `brow-*`, `mouth-*`, `glasses-*`). */
export const TILES: Readonly<Record<string, TileRect>> = layout();

/** UV rectangle [u0, v0, u1, v1] of a tile for a flipY texture (v up). */
export function tileUv(id: string): readonly [number, number, number, number] {
  const [x, y, w, h] = TILES[id] ?? TILES['solid']!;
  return [x / ATLAS_SIZE, 1 - (y + h) / ATLAS_SIZE, (x + w) / ATLAS_SIZE, 1 - y / ATLAS_SIZE];
}

const DARK = '#151515';
const LIP = '#6b2424';

/** Paints the atlas: white masks (tinted by vertex colour) and coloured mouths. */
export function paintAtlas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  for (const [id, [x, y, w, h]] of Object.entries(TILES)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    const [kind, shape = ''] = id.split(/-(.*)/s) as [string, string?];
    if (kind === 'solid') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    } else if (kind === 'blush') ellipse(ctx, 32, 16, 29, 13, '#fff');
    else if (kind === 'eye') eye(ctx, shape);
    else if (kind === 'hl') highlight(ctx, shape);
    else if (kind === 'brow') brow(ctx, shape);
    else if (kind === 'mouth') mouth(ctx, shape);
    else if (kind === 'glasses') glasses(ctx, shape);
    ctx.restore();
  }
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function eye(ctx: CanvasRenderingContext2D, shape: string): void {
  if (shape === 'happy') {
    ctx.beginPath();
    ctx.arc(32, 42, 18, Math.PI * 1.1, Math.PI * 1.9);
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.strokeStyle = DARK;
    ctx.stroke();
    return;
  }
  const [rx, ry, pr] = shape === 'tall' ? [19, 28, 11] : shape === 'wide' ? [28, 19, 11] : shape === 'sparkle' ? [29, 29, 13] : [26, 26, 12];
  if (shape === 'sleepy') {
    ctx.beginPath();
    ctx.rect(0, 28, 64, 36);
    ctx.clip();
  }
  ellipse(ctx, 32, 32, rx, ry, '#fff');
  ellipse(ctx, 32, 33, pr, Math.round((pr * ry) / rx), DARK);
  if (shape === 'sleepy') {
    ctx.fillStyle = DARK;
    ctx.fillRect(4, 28, 56, 6);
  }
}

function highlight(ctx: CanvasRenderingContext2D, shape: string): void {
  const dots: Record<string, [number, number, number][]> = {
    round: [[41, 22, 7]],
    tall: [[38, 16, 6]],
    wide: [[44, 25, 6]],
    sleepy: [[41, 40, 5]],
    sparkle: [[41, 21, 8], [23, 43, 4]],
  };
  for (const [x, y, r] of dots[shape] ?? []) ellipse(ctx, x, y, r, r, '#fff');
}

function brow(ctx: CanvasRenderingContext2D, shape: string): void {
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (shape === 'arched') {
    ctx.moveTo(8, 20);
    ctx.quadraticCurveTo(30, 0, 56, 16);
    ctx.lineWidth = 7;
    ctx.stroke();
  } else if (shape === 'straight') {
    ctx.fillRect(8, 9, 48, 8);
  } else if (shape === 'bold') {
    ctx.moveTo(6, 8);
    ctx.lineTo(58, 4);
    ctx.lineTo(58, 18);
    ctx.lineTo(6, 22);
    ctx.fill();
  } else {
    ctx.moveTo(10, 16);
    ctx.quadraticCurveTo(32, 7, 54, 15);
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

function mouth(ctx: CanvasRenderingContext2D, shape: string): void {
  ctx.lineCap = 'round';
  if (shape === 'grin') {
    ctx.beginPath();
    ctx.moveTo(8, 6);
    ctx.lineTo(56, 6);
    ctx.quadraticCurveTo(54, 30, 32, 30);
    ctx.quadraticCurveTo(10, 30, 8, 6);
    ctx.fillStyle = LIP;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(12, 6, 40, 7);
  } else if (shape === 'open') {
    ellipse(ctx, 32, 16, 11, 13, LIP);
    ellipse(ctx, 32, 23, 8, 5, '#ee7d8a');
  } else if (shape === 'flat') {
    ctx.fillStyle = LIP;
    ctx.fillRect(18, 13, 28, 6);
  } else {
    ctx.beginPath();
    ctx.arc(32, 2, 22, Math.PI * 0.2, Math.PI * 0.8);
    ctx.lineWidth = 6;
    ctx.strokeStyle = LIP;
    ctx.stroke();
  }
}

function glasses(ctx: CanvasRenderingContext2D, shape: string): void {
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  for (const cx of [52, 140]) {
    ctx.beginPath();
    if (shape === 'square') {
      ctx.roundRect(cx - 29, 9, 58, 54, 8);
    } else if (shape === 'stars') {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 15 : 33;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(cx + Math.cos(a) * r, 39 + Math.sin(a) * r);
      }
      ctx.closePath();
    } else {
      ctx.arc(cx, 36, 28, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.fillRect(78, 31, 36, 7);
  ctx.fillRect(0, 33, 24, 6);
  ctx.fillRect(168, 33, 24, 6);
}
