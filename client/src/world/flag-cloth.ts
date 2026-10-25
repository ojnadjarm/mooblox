import type { BufferGeometry } from 'three';

/** Where a flag's cloth starts, as a fraction of the way from the pole (x = 0) to the tip (largest x). */
const CLOTH_ROOT = 0.09;
/** Vertices below this fraction of the model height belong to the pole. */
const CLOTH_LOW = 0.55;

/**
 * Marks a flag's cloth (flying along +x from a pole at x = 0) in its `sway` attribute as negative weights, 0 at the pole
 * down to -1 at the tip; the scenery shader flies negative weights as cloth (`material-kit.ts`) and sways positive ones.
 */
export function clothWeights(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute('position');
  const sway = g.getAttribute('sway');
  let top = 0;
  let tip = 0;
  for (let i = 0; i < pos.count; i++) {
    top = Math.max(top, pos.getY(i));
    tip = Math.max(tip, pos.getX(i));
  }
  const root = tip * CLOTH_ROOT;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    sway.setX(i, pos.getY(i) > top * CLOTH_LOW && x > root ? -Math.min(1, (x - root) / (tip - root)) : 0);
  }
  sway.needsUpdate = true;
  return g;
}
