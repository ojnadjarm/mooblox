/**
 * Game feel as pure steps (no three.js, no DOM): movement easing, forgiving jumps, landing squash, dust puffs, camera
 * zoom and look-ahead. The player and camera feed them time and state; tests drive them directly.
 */

export const Feel = {
  /** Ground acceleration and braking (m/s²): about 0.13 s to walk speed, a short slide to a stop. */
  accel: 45,
  brake: 60,
  /** In the air the stick steers less. */
  airAccel: 20,
  /** A jump still counts this long after walking off an edge, and a press this long before landing. */
  coyote: 0.1,
  buffer: 0.12,
  /** Landing squash length (s) and depth at a hard landing. */
  squashTime: 0.2,
  squashDepth: 0.22,
  /** Fall speed (m/s) below which a landing gets no squash or dust. */
  softLanding: 4,
  /** Seconds between footstep puffs at run speed. */
  stride: 0.26,
  puffLife: 0.55,
  zoomMin: 6,
  zoomMax: 16,
  /** Seconds of the player's velocity the camera looks ahead by. */
  lookAhead: 0.3,
} as const;

/** Moves `v` (horizontal velocity, m/s) towards `want` at ground or air acceleration; returns `v`. */
export function accelerate(v: { x: number; z: number }, wantX: number, wantZ: number, onGround: boolean, dt: number): { x: number; z: number } {
  const dx = wantX - v.x;
  const dz = wantZ - v.z;
  const gap = Math.hypot(dx, dz);
  if (gap === 0) return v;
  const braking = wantX * wantX + wantZ * wantZ < v.x * v.x + v.z * v.z;
  const rate = onGround ? (braking ? Feel.brake : Feel.accel) : Feel.airAccel;
  const k = Math.min(1, (rate * dt) / gap);
  v.x += dx * k;
  v.z += dz * k;
  return v;
}

/** Coyote time and jump buffering: a press shortly before landing, or a jump just after leaving an edge, still jumps. */
export class JumpGate {
  private sinceGround = Infinity;
  private sincePress = Infinity;

  /** Records a press of the jump button (its rising edge). */
  press(): void {
    this.sincePress = 0;
  }

  /** One fixed step: whether to start a jump now. */
  step(dt: number, onGround: boolean): boolean {
    this.sinceGround = onGround ? 0 : this.sinceGround + dt;
    const jump = this.sincePress <= Feel.buffer && this.sinceGround <= Feel.coyote;
    this.sincePress += dt;
    if (jump) {
      this.sinceGround = this.sincePress = Infinity;
    }
    return jump;
  }
}

/** Avatar scale (xz, y) `t` seconds after a landing of strength 0..1: a quick squash that springs back, volume kept. */
export function squash(t: number, strength: number): { readonly xz: number; readonly y: number } {
  if (t >= Feel.squashTime || strength <= 0) return { xz: 1, y: 1 };
  const y = 1 - Feel.squashDepth * strength * Math.sin((Math.PI * t) / Feel.squashTime);
  return { xz: 1 / Math.sqrt(y), y };
}

/** Landing strength 0..1 from the fall speed at touch-down (m/s, positive down). */
export function landing(fallSpeed: number): number {
  return Math.max(0, Math.min(1, (fallSpeed - Feel.softLanding) / 12));
}

/** One dust puff: where it is, how it drifts and how old it is. */
export interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  size: number;
}

/** Ages and drifts the puffs, rising at `rise` m/s, dropping dead ones (in place); returns the live count. */
export function stepPuffs(puffs: Puff[], dt: number, rise = 0.6): number {
  let n = 0;
  for (const p of puffs) {
    p.age += dt;
    if (p.age >= Feel.puffLife) continue;
    const drag = Math.exp(-4 * dt);
    p.vx *= drag;
    p.vz *= drag;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.y += rise * dt;
    puffs[n++] = p;
  }
  puffs.length = n;
  return n;
}

/** Scale of a puff by age: pops up, then shrinks away. */
export function puffScale(p: Puff): number {
  const t = p.age / Feel.puffLife;
  return t >= 1 ? 0 : p.size * Math.min(1, t * 6) * (1 - t * t);
}

/** Camera distance after a wheel step (deltaY > 0 zooms out), kept between the zoom limits. */
export function zoom(distance: number, deltaY: number): number {
  return Math.max(Feel.zoomMin, Math.min(Feel.zoomMax, distance * Math.exp(deltaY * 0.001)));
}

/** Frame-rate independent exponential approach of `value` to `target` at `rate` per second. */
export function damp(value: number, target: number, rate: number, dt: number): number {
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}
