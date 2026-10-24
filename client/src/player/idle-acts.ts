/**
 * Idle acts as pure data and one step (no three.js): a kid standing still now and then plays a one-shot act (a nod, a head shake,
 * a stretch, a cheer, a wave), each kid on its own timing and in its own order, and waves when it first notices the player.
 */
import { hash01 } from './motion';

export const ACTS = {
  /** Seconds standing before an act (base + per-act spread). */
  gap: 4,
  gapSpread: 6,
  /** Look weight at which a standing kid has noticed the player, and seconds before it waves at them again. */
  notice: 0.5,
  waveAgain: 15,
} as const;

/** Clips a standing kid picks from, as often as the weight; `wave` is also the greeting. */
export const IDLE_ACTS: readonly { readonly clip: string; readonly weight: number }[] = [
  { clip: 'emote-yes', weight: 2 },
  { clip: 'emote-no', weight: 1 },
  { clip: 'stretch', weight: 2 },
  { clip: 'cheer', weight: 1 },
  { clip: 'wave', weight: 1 },
];
export const WAVE = IDLE_ACTS.findIndex((a) => a.clip === 'wave');
const TOTAL = IDLE_ACTS.reduce((s, a) => s + a.weight, 0);

/** Slots of a kid's act state: seconds standing, the gap to the next act, acts so far, the act playing (-1 none), its seconds left, the greeting, and the look weight (input, 0..1). */
export const A = {
  still: 0,
  gap: 1,
  count: 2,
  playing: 3,
  left: 4,
  sinceWave: 5,
  noticed: 6,
  attend: 7,
} as const;

/** What `stepActs` asks the avatar to do. */
export const KEEP = -1;
export const STOP = -2;

/** Fresh act state; the first gap is the kid's own. */
export function actState(seed: number): Float64Array {
  const a = new Float64Array(8);
  a[A.gap] = ACTS.gap + hash01(seed, 21) * ACTS.gapSpread;
  a[A.playing] = -1;
  a[A.sinceWave] = Infinity;
  return a;
}

/** The act index kid `seed` plays as its `n`th act. */
export function pickAct(seed: number, n: number): number {
  let r = hash01(seed * 53 + n, 22) * TOTAL;
  for (let i = 0; i < IDLE_ACTS.length; i++) {
    r -= IDLE_ACTS[i]!.weight;
    if (r < 0) return i;
  }
  return IDLE_ACTS.length - 1;
}

/**
 * Advances `a` by `dt` while standing (`idle`) or not, with `has(i)` = act i can play; returns the
 * act to start, STOP (fade back to the clip) or KEEP. The avatar sets `a[A.left]` to the started act's length. Allocates nothing.
 */
export function stepActs(a: Float64Array, seed: number, idle: boolean, dt: number, has: (i: number) => boolean): number {
  a[A.sinceWave] = a[A.sinceWave]! + dt;
  const noticed = a[A.attend]! > ACTS.notice;
  const greet = noticed && a[A.noticed] === 0 && a[A.sinceWave]! > ACTS.waveAgain;
  a[A.noticed] = noticed ? 1 : 0;
  if (!idle) {
    a[A.still] = 0;
    if (a[A.playing]! < 0) return KEEP;
    a[A.playing] = -1;
    return STOP;
  }
  a[A.still] = a[A.still]! + dt;
  if (a[A.playing]! >= 0) {
    a[A.left] = a[A.left]! - dt;
    if (a[A.left]! > 0) return KEEP;
    a[A.playing] = -1;
    a[A.still] = 0;
    return STOP;
  }
  const n = a[A.count]!;
  const next = greet ? WAVE : a[A.still]! >= a[A.gap]! ? pickAct(seed, n) : -1;
  if (next < 0 || !has(next)) return KEEP;
  a[A.count] = n + 1;
  a[A.gap] = ACTS.gap + hash01(seed * 53 + n, 23) * ACTS.gapSpread;
  a[A.playing] = next;
  if (next === WAVE) a[A.sinceWave] = 0;
  return next;
}
