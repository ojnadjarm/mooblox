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

/** How far (as a wind `sway` weight) a hanging banner's free bottom edge swings; its top on the bar stays put. */
const HANG_SWING = 0.7;

/** Weights a hanging banner's cloth (the strongly red or green faces) for the wind sway, 0 at its top rising to HANG_SWING at its foot. */
export function hangingCloth(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const sway = g.getAttribute('sway');
  const cloth = (i: number) => {
    const r = col.getX(i), gr = col.getY(i), b = col.getZ(i);
    return r > gr * 2.2 && r > b * 2.2 || gr > r * 1.5 && gr > b * 1.3;
  };
  let top = -Infinity;
  let foot = Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (!cloth(i)) continue;
    top = Math.max(top, pos.getY(i));
    foot = Math.min(foot, pos.getY(i));
  }
  if (!(top > foot)) return g;
  for (let i = 0; i < pos.count; i++) sway.setX(i, cloth(i) ? ((top - pos.getY(i)) / (top - foot)) * HANG_SWING : 0);
  sway.needsUpdate = true;
  return g;
}
