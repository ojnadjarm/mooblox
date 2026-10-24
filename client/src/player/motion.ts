/**
 * Procedural motion layered over the clips, as pure data and one kernel (no three.js, no calls in the hot path): per-kid pace
 * so a crowd never moves in lockstep, stride rate matched to ground speed, idle glances and breathing, run lean, banking.
 */

export const MOTION = {
  /** Ground speed (m/s) the walk and run clips were authored for. */
  walkSpeed: 6,
  runSpeed: 10,
  /** Stride playback rate limits when matched to ground speed. */
  minRate: 0.55,
  maxRate: 1.3,
  /** Per-kid playback rate spread (±). */
  rateSpread: 0.08,
  /** Idle glance: seconds per look (base + spread), the share of it spent turning, and the yaw/pitch ranges (rad). */
  glancePeriod: 2.6,
  glanceSpread: 2,
  glanceTurn: 0.16,
  glanceYaw: 0.6,
  glancePitchUp: 0.12,
  glancePitchDown: 0.18,
  /** Share of glances that look straight ahead, and looks per kid before they repeat. */
  glanceAhead: 0.35,
  looks: 8,
  /** Breathing: seconds per breath and torso stretch. */
  breathPeriod: 3.2,
  breathDepth: 0.02,
  /** Forward lean at run speed and the bank per rad/s of turn (rad), both capped. */
  lean: 0.2,
  bank: 0.045,
  maxBank: 0.16,
  /** How much of the lean the head takes back, so the eyes stay level. */
  headCounter: 0.6,
  /** Rate (1/s) the layer weights follow the state. */
  blend: 8,
} as const;

/** Clip state codes for the kernel. */
export const IDLE = 0;
export const WALK = 1;
export const RUN = 2;
export const JUMP = 3;
export type MotionCode = typeof IDLE | typeof WALK | typeof RUN | typeof JUMP;

/** Slots of a kid's motion state (a Float64Array): inputs, smoothed weights, outputs, per-kid constants, then the looks. */
export const M = {
  time: 0,
  /** Input: ground speed m/s (NaN = as authored) and turn rate rad/s (+ = towards +x, the kid's left). */
  speed: 1,
  turn: 2,
  idle: 3,
  lean: 4,
  bank: 5,
  /** Output: loop playback rate, torso pitch/yaw/roll + stretch, head pitch/yaw/roll (each bone's angles in x, y, z order). */
  rate: 6,
  torsoPitch: 7,
  torsoYaw: 8,
  torsoRoll: 9,
  torsoStretch: 10,
  headPitch: 11,
  headYaw: 12,
  headRoll: 13,
  phase: 14,
  period: 15,
  baseRate: 16,
  looks: 17,
} as const;

/** A 0..1 hash of an integer pair (stable across runs). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Fresh motion state of kid `seed`: own clip phase (0..1), rate, glance period and looks (yaw, pitch pairs). */
export function motionState(seed: number): Float64Array {
  const m = new Float64Array(M.looks + MOTION.looks * 2);
  m[M.speed] = NaN;
  m[M.idle] = 1;
  m[M.rate] = 1;
  m[M.phase] = hash01(seed, 1);
  m[M.baseRate] = 1 + (hash01(seed, 2) * 2 - 1) * MOTION.rateSpread;
  m[M.period] = MOTION.glancePeriod + hash01(seed, 3) * MOTION.glanceSpread;
  for (let k = 0; k < MOTION.looks; k++) {
    const ahead = hash01(seed * 31 + k, 7) < MOTION.glanceAhead;
    const u = hash01(seed * 31 + k, 12);
    m[M.looks + k * 2] = ahead ? 0 : (hash01(seed * 31 + k, 11) * 2 - 1) * MOTION.glanceYaw;
    m[M.looks + k * 2 + 1] = ahead ? 0 : u < 0.5 ? -u * 2 * MOTION.glancePitchUp : (u - 0.5) * 2 * MOTION.glancePitchDown;
  }
  return m;
}

/** Advances `m` by `dt` seconds in clip state `code` and writes the outputs; allocates nothing. */
export function stepMotion(m: Float64Array, code: MotionCode, dt: number): void {
  const t = (m[M.time] = m[M.time]! + dt);
  const natural = code === WALK ? MOTION.walkSpeed : code === IDLE ? 0 : MOTION.runSpeed;
  const raw = m[M.speed]!;
  const speed = raw !== raw ? natural : raw;
  const moving = code === WALK || code === RUN;
  const stride = raw !== raw ? 1 : Math.max(MOTION.minRate, Math.min(MOTION.maxRate, raw / (natural || 1)));
  m[M.rate] = code === JUMP ? 1 : moving ? m[M.baseRate]! * stride : m[M.baseRate]!;
  const k = 1 - Math.exp(-MOTION.blend * dt);
  const share = moving ? Math.min(1, speed / MOTION.runSpeed) : 0;
  const idle = (m[M.idle] = m[M.idle]! + ((code === IDLE ? 1 : 0) - m[M.idle]!) * k);
  const lean = (m[M.lean] = m[M.lean]! + (MOTION.lean * share - m[M.lean]!) * k);
  const roll = Math.max(-MOTION.maxBank, Math.min(MOTION.maxBank, -m[M.turn]! * MOTION.bank)) * share;
  const bank = (m[M.bank] = m[M.bank]! + (roll - m[M.bank]!) * k);
  const x = t / m[M.period]! + m[M.phase]!;
  const n = Math.floor(x);
  const f0 = Math.min(1, (x - n) / MOTION.glanceTurn);
  const f = f0 * f0 * (3 - 2 * f0);
  const to = M.looks + (n % MOTION.looks) * 2;
  const from = M.looks + ((n + MOTION.looks - 1) % MOTION.looks) * 2;
  const yaw = m[from]! + (m[to]! - m[from]!) * f;
  const pitch = m[from + 1]! + (m[to + 1]! - m[from + 1]!) * f;
  m[M.torsoPitch] = lean;
  m[M.torsoRoll] = bank;
  m[M.torsoStretch] = MOTION.breathDepth * Math.sin((2 * Math.PI * t) / MOTION.breathPeriod + m[M.phase]! * 6.283) * (0.3 + 0.7 * idle);
  m[M.headPitch] = pitch * idle - lean * MOTION.headCounter;
  m[M.headYaw] = yaw * idle;
  m[M.headRoll] = -bank * 0.5;
}
