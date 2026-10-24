/** A pixel rectangle as fractions of the texture (top-left origin). */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Shirt areas of a Kenney Blocky skin: torso and both arms (legs and head keep their colours). */
export const KENNEY_SHIRT: readonly Rect[] = [
  { x0: 0, y0: 0.62, x1: 0.45, y1: 1 },
  { x0: 0.45, y0: 0.48, x1: 1, y1: 0.76 },
];

const MIN_SATURATION = 0.22;

/** Repaints coloured clothing pixels in `rects` with the tint's hue and saturation, keeping their lightness; skin tones stay. */
export function recolorClothes(data: Uint8ClampedArray, width: number, height: number, tint: number, rects: readonly Rect[]): number {
  const [th, ts] = rgbToHsl((tint >> 16) & 255, (tint >> 8) & 255, tint & 255);
  let changed = 0;
  for (const r of rects) {
    for (let y = Math.floor(r.y0 * height); y < Math.floor(r.y1 * height); y++) {
      for (let x = Math.floor(r.x0 * width); x < Math.floor(r.x1 * width); x++) {
        const i = (y * width + x) * 4;
        const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);
        if (s < MIN_SATURATION || isSkinTone(h, s, l)) {
          continue;
        }
        const [nr, ng, nb] = hslToRgb(th, Math.max(ts, 0.45), l);
        data[i] = nr;
        data[i + 1] = ng;
        data[i + 2] = nb;
        changed++;
      }
    }
  }
  return changed;
}

/** Warm, muted hues of human skin and hair (hue in degrees, s and l in 0..1). */
export function isSkinTone(h: number, s: number, l: number): boolean {
  return h >= 5 && h <= 45 && s < 0.75 && l > 0.2;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
