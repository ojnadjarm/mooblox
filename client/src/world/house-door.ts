import type { TriSink, WallFrame } from './tri-sink';
import { INTERIOR } from './window-room';

/** Kit house doorway size (model units): the closed front doors' outline. */
export const DOORWAY = { width: 0.14, height: 0.27 } as const;

const PAINT = [0x3f8fa3, 0xc8553d, 0x4a8c5c, 0x5b6fc4, 0xd98a2b];
const KNOB = 0xe8b84a;

/** Scales a hex colour. */
function shade(colour: number, k: number): number {
  const ch = (sh: number) => Math.min(255, Math.round(((colour >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A closed painted door filling the doorway centred at `s` on wall `f`: two raised panels, a lit four-pane window, a brass knob. */
export function closedDoor(sink: TriSink, f: WallFrame, s: number, seed: number): void {
  // The leaf runs a little behind the frame on every side, so no sliver of the doorway shows.
  const w = DOORWAY.width / 2 + 0.015;
  const h = DOORWAY.height + 0.01;
  const paint = PAINT[seed % PAINT.length]!;
  const trim = shade(paint, 0.72);
  const k = 0.006;
  sink.card(f, s - w, s + w, -0.01, h, k, paint, 'colormap-door');
  for (const side of [-1, 1]) {
    const a = side < 0 ? s - 0.052 : s + 0.008;
    sink.block(f, a, a + 0.044, 0.025, 0.115, k - 0.003, k, trim, 'colormap-door');
  }
  const ws = 0.034;
  const [t0, t1] = [0.15, 0.235];
  sink.card(f, s - ws, s + ws, t0, t1, k - 0.001, 0xffd68a, INTERIOR, 1.35);
  const bar = 0.006;
  sink.block(f, s - ws - bar, s + ws + bar, t1, t1 + bar, k - 0.004, k, trim, 'colormap-door');
  sink.block(f, s - ws - bar, s + ws + bar, t0 - bar, t0, k - 0.004, k, trim, 'colormap-door');
  sink.block(f, s - ws - bar, s - ws, t0, t1, k - 0.004, k, trim, 'colormap-door');
  sink.block(f, s + ws, s + ws + bar, t0, t1, k - 0.004, k, trim, 'colormap-door');
  sink.block(f, s - bar / 2, s + bar / 2, t0, t1, k - 0.003, k, trim, 'colormap-door');
  sink.block(f, s - ws, s + ws, (t0 + t1) / 2 - bar / 2, (t0 + t1) / 2 + bar / 2, k - 0.003, k, trim, 'colormap-door');
  sink.block(f, s + 0.04, s + 0.054, 0.125, 0.139, k - 0.01, k, KNOB, 'colormap-iron');
}
