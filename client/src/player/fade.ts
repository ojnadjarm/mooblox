/** See-through tuning: a character's half-width with swinging arms and height (m), the player's half-width (m), how close to the lens it vanishes (m), the most it fades, the ramp across its edge (m) and the ease rates in and out (1/s). */
export const SEE = { body: 0.75, height: 2.8, player: 0.5, lens: 1.4, max: 0.75, edge: 0.35, fadeIn: 24, fadeOut: 6 } as const;

/**
 * How far a character standing at (x, y, z) should fade (0 solid .. SEE.max) so the camera at (cx, cy, cz) keeps seeing the player's
 * chest at (px, py, pz): it fades when its body stands in the sight line nearer than the player, or the camera is close to it.
 */
export function seeThrough(x: number, y: number, z: number, cx: number, cy: number, cz: number, px: number, py: number, pz: number): number {
  const kx = x - cx;
  const kz = z - cz;
  const lens = Math.sqrt(kx * kx + kz * kz);
  if (lens < SEE.lens && cy > y - 0.5 && cy < y + SEE.height + 1.5) return SEE.max;
  const lx = px - cx;
  const lz = pz - cz;
  const len2 = lx * lx + lz * lz;
  if (len2 < 1e-6) return 0;
  const u = (kx * lx + kz * lz) / len2;
  if (u <= 0 || u >= 1) return 0;
  const sy = cy + (py - cy) * u;
  if (sy < y || sy > y + SEE.height) return 0;
  const dx = kx - lx * u;
  const dz = kz - lz * u;
  const gap = SEE.body + SEE.player - Math.sqrt(dx * dx + dz * dz);
  return gap <= 0 ? 0 : SEE.max * Math.min(1, gap / SEE.edge);
}

/** Eases a fade towards its target over `dt` seconds. */
export function easeFade(fade: number, target: number, dt: number): number {
  const next = fade + (target - fade) * Math.min(1, (target > fade ? SEE.fadeIn : SEE.fadeOut) * dt);
  return Math.abs(next - target) < 0.005 ? target : next;
}
