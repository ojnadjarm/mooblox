import type { TriSink, WallFrame } from './tri-sink';

/** A window pane on a house wall: wall frame at the glass plane, pane bounds along the wall (s) and up (t). */
export interface Pane {
  readonly frame: WallFrame;
  readonly s0: number;
  readonly s1: number;
  readonly t0: number;
  readonly t1: number;
}

/** Source material name of interior parts (`kit-materials.ts`: smooth, no painted pattern). */
export const INTERIOR = 'interior';

const WALLPAPER = [0xf2c98a, 0xf0a878, 0xf5dc8c, 0xd2b8e8, 0xb8d4f0, 0xf2b8c4];
const CURTAIN = [0xd9534f, 0x3f8fc4, 0xf2b84b, 0xef7fa8, 0x5b8bd9, 0x9a6ad8];
const BOOKS = [0xd9534f, 0x3f7fd9, 0xf2b84b, 0xef7fa8, 0x8e5ad8, 0xff9a3c];
const WOOD = 0x9a6a3e;
const DARK_WOOD = 0x6e4a2a;
const LAMP = 0xffd27a;
const HALO = 0xffe6b0;
const LIT = 1.35;
const CHAIR = 0xc8653d;

/** Scales a hex colour (0..1 keeps it darker). */
function shade(colour: number, k: number): number {
  const ch = (sh: number) => Math.min(255, Math.round(((colour >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * A cosy room seen through a pane (real depth, no texture): an inset box with wallpaper, wood floor and ceiling, furniture
 * cards and blocks against its back wall, a warm lamp brighter than daylight, and curtains just behind the glass. `seed` picks
 * the wallpaper, curtains and one of four furniture sets, so the windows of a house differ.
 */
export function windowRoom(sink: TriSink, pane: Pane, seed: number): void {
  const f = pane.frame;
  const gw = pane.s1 - pane.s0;
  const gh = pane.t1 - pane.t0;
  const m = Math.min(0.025, 0.25 * Math.min(gw, gh) + 0.01);
  const s0 = pane.s0 - m;
  const s1 = pane.s1 + m;
  const t0 = pane.t0 - m;
  const t1 = pane.t1 + m;
  const d = Math.min(0.1, Math.max(0.05, 0.55 * gw));
  const wall = WALLPAPER[seed % WALLPAPER.length]!;
  const curtain = CURTAIN[(seed >>> 3) % CURTAIN.length]!;
  const inward = f.n.clone().negate();
  const u = f.u;
  const up = f.up;
  const along = (k: number) => u.clone().multiplyScalar(k);
  const rise = (k: number) => up.clone().multiplyScalar(k);
  const deep = (k: number) => inward.clone().multiplyScalar(k);
  // Lamplight: the room stays warm and bright even where the house shades it.
  sink.card(f, s0, s1, t0, t1, d, wall, INTERIOR, LIT);
  sink.rect(f.at(s0, t0, 0), along(s1 - s0), deep(d), up, WOOD, INTERIOR, LIT);
  sink.rect(f.at(s0, t1, 0), along(s1 - s0), deep(d), up.clone().negate(), wall, INTERIOR, LIT * 1.2);
  sink.rect(f.at(s0, t0, 0), rise(t1 - t0), deep(d), u, shade(wall, 0.9), INTERIOR, LIT);
  sink.rect(f.at(s1, t0, 0), rise(t1 - t0), deep(d), u.clone().negate(), shade(wall, 0.9), INTERIOR, LIT);
  const back = d - 0.002;
  const at = (k: number) => s0 + (s1 - s0) * k;
  const ht = (k: number) => t0 + (t1 - t0) * k;
  if (gh < 0.06) {
    // Attic slit: a pendant lamp and its glow.
    sink.card(f, at(0.3), at(0.7), ht(0.15), ht(0.95), back, HALO, INTERIOR, 1.7);
    sink.block(f, at(0.44), at(0.56), ht(0.45), ht(0.7), d * 0.5, d * 0.5 + 0.02, LAMP, INTERIOR, 2.2);
  } else {
    const set = (seed >>> 6) % 4;
    if (set === 0) {
      // Floor lamp left, shelf of books right.
      sink.card(f, at(0.08), at(0.42), ht(0.35), ht(0.95), back, HALO, INTERIOR, 1.6);
      sink.card(f, at(0.23), at(0.27), t0, ht(0.62), back - 0.003, DARK_WOOD, INTERIOR);
      sink.block(f, at(0.15), at(0.35), ht(0.6), ht(0.78), back - 0.025, back - 0.004, LAMP, INTERIOR, 2.2);
      books(sink, f, at(0.55), at(0.92), ht(0.5), ht(0.68), back, seed);
    } else if (set === 1) {
      // Picture over a sofa, table lamp right.
      sink.card(f, at(0.28), at(0.62), ht(0.55), ht(0.85), back, DARK_WOOD, INTERIOR);
      sink.card(f, at(0.31), at(0.59), ht(0.58), ht(0.82), back - 0.001, 0x8fd0f0, INTERIOR);
      sink.card(f, at(0.31), at(0.59), ht(0.58), ht(0.67), back - 0.0015, 0xf2a03c, INTERIOR);
      sink.block(f, at(0.12), at(0.7), t0, ht(0.3), back - 0.03, back, curtain === CURTAIN[0] ? 0x3f7fd9 : 0xd9534f, INTERIOR);
      sink.card(f, at(0.7), at(0.98), ht(0.3), ht(0.85), back, HALO, INTERIOR, 1.6);
      sink.block(f, at(0.76), at(0.92), ht(0.45), ht(0.6), back - 0.02, back - 0.004, LAMP, INTERIOR, 2.2);
      sink.card(f, at(0.82), at(0.86), t0, ht(0.45), back - 0.003, DARK_WOOD, INTERIOR);
    } else if (set === 2) {
      // Bookcase and a pendant lamp.
      sink.card(f, at(0.05), at(0.45), t0, ht(0.9), back, DARK_WOOD, INTERIOR);
      books(sink, f, at(0.08), at(0.42), ht(0.12), ht(0.38), back - 0.001, seed);
      books(sink, f, at(0.08), at(0.42), ht(0.48), ht(0.74), back - 0.001, seed + 3);
      sink.card(f, at(0.5), at(0.95), ht(0.2), ht(0.95), back, HALO, INTERIOR, 1.7);
      sink.card(f, at(0.71), at(0.73), ht(0.7), t1, back - 0.012, DARK_WOOD, INTERIOR);
      sink.block(f, at(0.62), at(0.82), ht(0.55), ht(0.72), back - 0.03, back - 0.01, LAMP, INTERIOR, 2.2);
    } else {
      // Armchair with a cushion, wall lamp and a little framed heart.
      sink.block(f, at(0.06), at(0.38), t0, ht(0.28), back - 0.035, back, CHAIR, INTERIOR);
      sink.block(f, at(0.06), at(0.38), ht(0.28), ht(0.55), back - 0.01, back, CHAIR, INTERIOR);
      sink.block(f, at(0.16), at(0.28), ht(0.28), ht(0.4), back - 0.025, back - 0.01, 0xf2b84b, INTERIOR);
      sink.card(f, at(0.45), at(0.85), ht(0.4), ht(0.95), back, HALO, INTERIOR, 1.6);
      sink.block(f, at(0.58), at(0.72), ht(0.62), ht(0.78), back - 0.015, back - 0.002, LAMP, INTERIOR, 2.2);
      sink.card(f, at(0.75), at(0.95), ht(0.25), ht(0.5), back, DARK_WOOD, INTERIOR);
      sink.card(f, at(0.79), at(0.91), ht(0.29), ht(0.46), back - 0.001, 0xef7fa8, INTERIOR);
    }
  }
  // Curtains drawn back to the sides, a valance on top; a lighter fold down each.
  const cw = Math.max(0.012, gw * 0.2);
  sink.card(f, s0, pane.s0 + cw, t0, t1, 0.004, curtain, INTERIOR);
  sink.card(f, pane.s1 - cw, s1, t0, t1, 0.004, curtain, INTERIOR);
  sink.card(f, pane.s0 + cw * 0.35, pane.s0 + cw * 0.6, t0, t1, 0.0035, shade(curtain, 1.2), INTERIOR);
  sink.card(f, pane.s1 - cw * 0.6, pane.s1 - cw * 0.35, t0, t1, 0.0035, shade(curtain, 1.2), INTERIOR);
  sink.card(f, s0, s1, pane.t1 - Math.min(0.012, gh * 0.18), t1, 0.003, shade(curtain, 0.85), INTERIOR);
}

/** A shelf plank with a row of upright books on it. */
function books(sink: TriSink, f: WallFrame, s0: number, s1: number, t0: number, t1: number, back: number, seed: number): void {
  sink.block(f, s0, s1, t0 - 0.006, t0, back - 0.02, back, WOOD, INTERIOR);
  const n = 5;
  const w = (s1 - s0) / n;
  for (let i = 0; i < n; i++) {
    const h = t0 + (t1 - t0) * (0.7 + 0.3 * (((seed + i * 7) % 5) / 4));
    sink.card(f, s0 + i * w + w * 0.08, s0 + (i + 1) * w - w * 0.08, t0, h, back - 0.004, BOOKS[(seed + i) % BOOKS.length]!, INTERIOR);
  }
}
