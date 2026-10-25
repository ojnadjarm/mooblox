/**
 * Procedural motion layered over the clips, as pure data and one kernel (no three.js, no calls in the hot path): per-kid pace
 * so a crowd never moves in lockstep, stride rate matched to ground speed, idle glances and breathing, run lean, banking, and a
 * springy push: leaning into a start, rocking back on a stop, turning head and shoulders to a nearby player, the head leading a turn,
 * a knees-in dip on landing, a slow weight shift while standing, an air tilt (chest up on the way up, eyes to the ground on the way down),
 * and a per-kid bearing (chest proud or slouched, a habitual head tilt) so a crowd reads as different kids.
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
  /** Push: lean per m/s² of speeding up (back when braking), its cap (rad), and its spring's stiffness (1/s²) and damping (1/s). */
  push: 0.004,
  maxPush: 0.2,
  pushStiffness: 150,
  pushDamping: 11,
  /** How much of the lean the head takes back, so the eyes stay level. */
  headCounter: 0.6,
  /** Look-at: notice within `lookNear` m inside the cone (rad either side), let go past `lookFar` m; total yaw and pitch caps (rad). */
  lookNear: 6,
  lookFar: 8,
  lookCone: 1.9,
  lookYaw: 1.3,
  lookPitch: 0.35,
  /** Share of the look the torso takes, the look's weight while moving, and the reaction rate (1/s, base + per-kid spread). */
  lookTorso: 0.3,
  lookMoving: 0.6,
  lookRate: 2,
  lookRateSpread: 3,
  /** The head leads a turn: yaw per rad/s of turn, capped (rad). */
  turnLead: 0.12,
  maxLead: 0.35,
  /** Landing: seconds of the dip-and-rebound, torso squash and head nod at its deepest. */
  landTime: 0.32,
  landDip: 0.1,
  landNod: 0.14,
  /** Standing weight shift: torso roll (rad) over this many glance periods. */
  swayRoll: 0.035,
  swayPeriods: 1.7,
  /** Air tilt per m/s of vertical speed (rad; + up tilts the chest and head back), capped either way. */
  airTilt: 0.014,
  maxAirTilt: 0.14,
  airHead: 0.02,
  maxAirHead: 0.2,
  /** Per-kid bearing: torso pitch range (rad, + = slouch forward) and habitual head roll (rad, either way), stronger standing. */
  posture: 0.06,
  tilt: 0.07,
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
  /** Last ground speed, then the push spring (value, velocity). */
  lastSpeed: 17,
  push: 18,
  pushVelocity: 19,
  /** Input: the player's yaw and pitch from this kid's facing (rad) and distance (m; NaN = none); then the look weight and rate. */
  focusYaw: 20,
  focusPitch: 21,
  focusDist: 22,
  attend: 23,
  lookRate: 24,
  /** Last clip state code and seconds since the last landing. */
  lastCode: 25,
  sinceLand: 26,
  /** Input: vertical speed m/s (+ up; NaN = none), then the smoothed air weight. */
  vy: 27,
  air: 28,
  /** Per-kid bearing: torso pitch offset and head roll habit (rad). */
  posture: 29,
  tilt: 30,
  /** Input: a spot this kid looks at when the player is not near (x, z, eye-relative height m; NaN x = none). */
  gazeX: 31,
  gazeZ: 32,
  gazeUp: 33,
  looks: 34,
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
  m[M.lastSpeed] = NaN;
  m[M.idle] = 1;
  m[M.rate] = 1;
  m[M.phase] = hash01(seed, 1);
  m[M.baseRate] = 1 + (hash01(seed, 2) * 2 - 1) * MOTION.rateSpread;
  m[M.period] = MOTION.glancePeriod + hash01(seed, 3) * MOTION.glanceSpread;
  m[M.focusDist] = NaN;
  m[M.gazeX] = NaN;
  m[M.lookRate] = MOTION.lookRate + hash01(seed, 4) * MOTION.lookRateSpread;
  m[M.sinceLand] = Infinity;
  m[M.vy] = NaN;
  m[M.posture] = (hash01(seed, 5) * 2 - 1) * MOTION.posture;
  m[M.tilt] = (hash01(seed, 6) * 2 - 1) * MOTION.tilt;
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
  const last = m[M.lastSpeed]!;
  m[M.lastSpeed] = raw;
  const accel = raw !== raw || last !== last || dt <= 0 ? 0 : (raw - last) / dt;
  const h = dt < 0.05 ? dt : 0.05;
  const pushTarget = Math.max(-MOTION.maxPush, Math.min(MOTION.maxPush, accel * MOTION.push));
  const pv = (m[M.pushVelocity] = m[M.pushVelocity]! + (MOTION.pushStiffness * (pushTarget - m[M.push]!) - MOTION.pushDamping * m[M.pushVelocity]!) * h);
  const push = (m[M.push] = m[M.push]! + pv * h);
  const x = t / m[M.period]! + m[M.phase]!;
  const n = Math.floor(x);
  const f0 = Math.min(1, (x - n) / MOTION.glanceTurn);
  const f = f0 * f0 * (3 - 2 * f0);
  const to = M.looks + (n % MOTION.looks) * 2;
  const from = M.looks + ((n + MOTION.looks - 1) % MOTION.looks) * 2;
  const yaw = m[from]! + (m[to]! - m[from]!) * f;
  const pitch = m[from + 1]! + (m[to + 1]! - m[from + 1]!) * f;
  const dist = m[M.focusDist]!;
  const fy = m[M.focusYaw]!;
  const held = m[M.attend]! > 0.05;
  const sees = dist < (held ? MOTION.lookFar : MOTION.lookNear) && Math.abs(fy) < MOTION.lookCone;
  const w = (m[M.attend] = m[M.attend]! + ((sees ? (moving ? MOTION.lookMoving : 1) : 0) - m[M.attend]!) * (1 - Math.exp(-m[M.lookRate]! * dt)));
  const look = w * Math.max(-MOTION.lookYaw, Math.min(MOTION.lookYaw, fy));
  const lookPitch = w * Math.max(-MOTION.lookPitch, Math.min(MOTION.lookPitch, m[M.focusPitch]!));
  const glance = idle * (1 - w);
  const lead = Math.max(-MOTION.maxLead, Math.min(MOTION.maxLead, m[M.turn]! * MOTION.turnLead)) * (1 - idle);
  if (m[M.lastCode] === JUMP && code !== JUMP) m[M.sinceLand] = 0;
  else m[M.sinceLand] = m[M.sinceLand]! + dt;
  m[M.lastCode] = code;
  const u = m[M.sinceLand]! / MOTION.landTime;
  const land = u < 1 ? Math.sin(Math.PI * 1.5 * u) * Math.sqrt(1 - u) : 0;
  const air = (m[M.air] = m[M.air]! + ((code === JUMP ? 1 : 0) - m[M.air]!) * k);
  const vy = m[M.vy]!;
  const rise = vy !== vy ? 0 : air * vy;
  const airTorso = Math.max(-MOTION.maxAirTilt, Math.min(MOTION.maxAirTilt, -rise * MOTION.airTilt));
  const airHead = Math.max(-MOTION.maxAirHead, Math.min(MOTION.maxAirHead, -rise * MOTION.airHead));
  const sway = MOTION.swayRoll * idle * Math.sin((2 * Math.PI * t) / (m[M.period]! * MOTION.swayPeriods) + m[M.phase]! * 17);
  const posture = m[M.posture]!;
  m[M.torsoPitch] = posture + lean + push + land * MOTION.landNod * 0.5 + airTorso;
  m[M.torsoYaw] = look * MOTION.lookTorso;
  m[M.torsoRoll] = bank + sway;
  m[M.torsoStretch] = MOTION.breathDepth * Math.sin((2 * Math.PI * t) / MOTION.breathPeriod + m[M.phase]! * 6.283) * (0.3 + 0.7 * idle) - land * MOTION.landDip;
  m[M.headPitch] = pitch * glance + lookPitch - (posture + lean + push) * MOTION.headCounter + land * MOTION.landNod * 0.5 + airHead;
  m[M.headYaw] = yaw * glance + look * (1 - MOTION.lookTorso) + lead;
  m[M.headRoll] = -bank * 0.5 - sway * 0.6 + m[M.tilt]! * (0.4 + 0.6 * idle);
}
