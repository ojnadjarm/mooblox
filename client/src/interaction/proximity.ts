import type { Plot } from '../world/layout';

/** Distance from a plot centre that brings its prompt up. */
export const ENTER_RADIUS = 3.2;
/** Distance that takes it down again (hysteresis, so the prompt does not flicker at the edge). */
export const EXIT_RADIUS = 3.8;

/** The plot the player stands at: the current one until left, else the nearest within reach. */
export function nearestPlot(plots: readonly Plot[], x: number, z: number, current: Plot | null): Plot | null {
  if (current && Math.sqrt((current.x - x) ** 2 + (current.z - z) ** 2) <= EXIT_RADIUS) {
    return current;
  }
  let best: Plot | null = null;
  let bestD = ENTER_RADIUS;
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i]!;
    const d = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
    if (d <= bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
