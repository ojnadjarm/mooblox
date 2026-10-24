/** Pure timetables for NPC kids: walkers stop and look round at each end of their path, players hop now and then. */

/** A path walker at time t: fraction along the path, which way it goes, and whether it walks or stands at an end. */
export function walkerAt(t: number, len: number, speed: number, pause: number): { readonly k: number; readonly back: boolean; readonly walking: boolean } {
  const leg = len / speed;
  const cycle = 2 * (leg + pause);
  const s = ((t % cycle) + cycle) % cycle;
  if (s < leg) return { k: s / leg, back: false, walking: true };
  if (s < leg + pause) return { k: 1, back: false, walking: false };
  if (s < 2 * leg + pause) return { k: 1 - (s - leg - pause) / leg, back: true, walking: true };
  return { k: 0, back: true, walking: false };
}

/** Hop height (m) of a playing kid: a 0.45 s arc, 0.9 m high, once every `period` seconds. */
export function hop(t: number, period: number): number {
  const s = ((t % period) + period) % period;
  const u = s / 0.45;
  return u < 1 ? 3.6 * u * (1 - u) : 0;
}
