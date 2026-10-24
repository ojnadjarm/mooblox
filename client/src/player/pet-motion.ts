/**
 * Pet secondary motion as pure data and one kernel (no three.js, nothing allocated): springy lean on starts and stops, bank into
 * turns, squash on landings, idle looks (up at the owner, ahead, a sniff), a wagging tail that streams back and swings out of turns,
 * and flapping wings. Layered over the pack's clips on the body, tail and wing nodes.
 */
import { hash01 } from './motion';

export const PET_MOTION = {
  /** Speed (m/s) counted as a full run for lean, bank and flap. */
  runSpeed: 8,
  /** Forward lean at run speed, lean per m/s² of braking (+) or speeding up (-), and its cap (rad). */
  lean: 0.12,
  brake: 0.012,
  maxPitch: 0.3,
  /** Bank per rad/s of turn at run speed and its cap (rad). */
  bank: 0.07,
  maxBank: 0.3,
  /** Body spring: stiffness (1/s²) and damping (1/s); underdamped so stops and turns overshoot once. */
  stiffness: 140,
  damping: 9,
  /** Vertical speed (m/s) to stretch, its cap, and the squash kick per m/s of fall on landing. */
  stretch: 0.03,
  maxStretch: 0.14,
  landKick: 0.35,
  /** Idle looks: seconds per look (base + spread), the share spent turning, owner look yaw cap and pitch, sniff pitch and yaw. */
  lookPeriod: 2.4,
  lookSpread: 1.6,
  lookTurn: 0.2,
  ownerYaw: 0.4,
  ownerPitch: -0.16,
  sniffPitch: 0.22,
  sniffYaw: 0.25,
  /** Tail wag: amplitude (rad) and rate (Hz) idle and at a run, its lift at a run, and its swing per rad/s of turn. */
  wagIdle: 0.4,
  wagRun: 0.14,
  wagHz: 2.2,
  wagRunHz: 3.4,
  tailLift: -0.35,
  tailSwing: 0.09,
  /** Wing flap amplitude (rad) idle and at a run, and its rate (Hz) idle and at a run. */
  flapIdle: 0.08,
  flapRun: 0.45,
  flapHz: 1.2,
  flapRunHz: 6,
  /** Rate (1/s) speed and turn rate are smoothed at before they drive the springs. */
  smooth: 12,
  /** Longest step the springs take (s); longer frames are clamped so a hitch never blows them up. */
  maxStep: 0.05,
} as const;

/** Slots of a pet's motion state (a Float64Array): inputs, memory, springs, per-pet constants, outputs. */
export const P = {
  /** Input: ground speed m/s, facing yaw (rad, 0 = +z), feet height, the owner's bearing from the pet's facing (rad, + = +yaw). */
  speed: 0,
  yaw: 1,
  y: 2,
  toOwner: 3,
  /** Input: step length (s); kept in the state so the call passes no double. */
  dt: 47,
  time: 4,
  started: 5,
  lastSpeed: 6,
  lastYaw: 7,
  lastY: 8,
  vy: 9,
  turn: 10,
  idle: 11,
  /** Springs (value, velocity) for pitch, roll, squash and tail, then their targets. */
  pitch: 12,
  roll: 14,
  squash: 16,
  tail: 18,
  targets: 20,
  phase: 24,
  period: 25,
  /** Output: body pitch/yaw/roll + stretch, tail pitch/yaw/roll, left and right wing pitch/yaw/roll (each node's x, y, z). */
  body: 26,
  bodyStretch: 29,
  tailOut: 30,
  wingLeft: 33,
  wingRight: 36,
  /** Per-pet sniff sides (-1..1), one per look. */
  sides: 39,
  size: 48,
} as const;

const SPRINGS = 4;
const SIDES = 8;

/** Fresh motion state of pet `seed`. */
export function petMotionState(seed: number): Float64Array {
  const m = new Float64Array(P.size);
  m[P.idle] = 1;
  m[P.phase] = hash01(seed, 21);
  m[P.period] = PET_MOTION.lookPeriod + hash01(seed, 22) * PET_MOTION.lookSpread;
  for (let k = 0; k < SIDES; k++) m[P.sides + k] = hash01(seed * 31 + k, 23) * 2 - 1;
  return m;
}

/** Advances `m` by `m[P.dt]` seconds from the inputs in its slots and writes the outputs; allocates nothing. */
export function stepPetMotion(m: Float64Array): void {
  const T = PET_MOTION;
  const dt = m[P.dt]!;
  const speedIn = m[P.speed]!;
  const yaw = m[P.yaw]!;
  const y = m[P.y]!;
  if (m[P.started] === 0 || dt <= 0) {
    m[P.started] = 1;
    m[P.lastSpeed] = speedIn;
    m[P.lastYaw] = yaw;
    m[P.lastY] = y;
    if (dt <= 0) return;
  }
  const h = Math.min(dt, T.maxStep);
  const t = (m[P.time] = m[P.time]! + dt);
  const k = 1 - Math.exp(-T.smooth * dt);
  const lastSpeed = m[P.lastSpeed]!;
  const speed = (m[P.lastSpeed] = lastSpeed + (speedIn - lastSpeed) * k);
  const accel = (speed - lastSpeed) / dt;
  let dyaw = yaw - m[P.lastYaw]!;
  dyaw -= Math.round(dyaw / (2 * Math.PI)) * 2 * Math.PI;
  m[P.lastYaw] = yaw;
  const turn = (m[P.turn] = m[P.turn]! + (dyaw / dt - m[P.turn]!) * k);
  const vy = (y - m[P.lastY]!) / dt;
  m[P.lastY] = y;
  const fell = m[P.vy]!;
  m[P.vy] = vy;
  const share = Math.min(1, speed / T.runSpeed);
  const idle = (m[P.idle] = m[P.idle]! + ((speed < 0.6 ? 1 : 0) - m[P.idle]!) * k);

  m[P.targets] = Math.max(-T.maxPitch, Math.min(T.maxPitch, T.lean * share - accel * T.brake));
  m[P.targets + 1] = Math.max(-T.maxBank, Math.min(T.maxBank, -turn * T.bank * share));
  m[P.targets + 2] = Math.min(T.maxStretch, Math.abs(vy) * T.stretch);
  m[P.targets + 3] = -turn * T.tailSwing;
  if (fell < -2 && vy > fell * 0.3) m[P.squash + 1] = m[P.squash + 1]! + fell * T.landKick;
  // Semi-implicit damped springs (value, velocity) towards their targets.
  for (let i = 0; i < SPRINGS; i++) {
    const at = P.pitch + i * 2;
    const v = (m[at + 1] = m[at + 1]! + (T.stiffness * (m[P.targets + i]! - m[at]!) - T.damping * m[at + 1]!) * h);
    m[at] = m[at]! + v * h;
  }

  // Idle looks cycle owner, ahead, sniff (in a per-pet order), with a smoothstep turn into each.
  const x = t / m[P.period]! + m[P.phase]!;
  const n = Math.floor(x);
  const f0 = Math.min(1, (x - n) / T.lookTurn);
  const f = f0 * f0 * (3 - 2 * f0);
  const owner = Math.max(-T.ownerYaw, Math.min(T.ownerYaw, m[P.toOwner]!));
  const to = n % 3;
  const from = (n + 2) % 3;
  const sniffSide = m[P.sides + (n % SIDES)]!;
  const lastSide = m[P.sides + ((n + SIDES - 1) % SIDES)]!;
  const yawTo = to === 0 ? owner : to === 2 ? sniffSide * T.sniffYaw : 0;
  const yawFrom = from === 0 ? owner : from === 2 ? lastSide * T.sniffYaw : 0;
  const pitchTo = to === 0 ? T.ownerPitch : to === 2 ? T.sniffPitch : 0;
  const pitchFrom = from === 0 ? T.ownerPitch : from === 2 ? T.sniffPitch : 0;

  const b = P.body;
  m[b] = m[P.pitch]! + (pitchFrom + (pitchTo - pitchFrom) * f) * idle;
  m[b + 1] = (yawFrom + (yawTo - yawFrom) * f) * idle;
  m[b + 2] = m[P.roll]!;
  m[P.bodyStretch] = m[P.squash]!;

  const wag = (T.wagIdle + (T.wagRun - T.wagIdle) * share) * Math.sin(2 * Math.PI * (T.wagHz + (T.wagRunHz - T.wagHz) * share) * t);
  m[P.tailOut] = T.tailLift * share;
  m[P.tailOut + 1] = wag + m[P.tail]!;
  m[P.tailOut + 2] = 0;

  const flap = (T.flapIdle + (T.flapRun - T.flapIdle) * share) * Math.max(0, Math.sin(2 * Math.PI * (T.flapHz + (T.flapRunHz - T.flapHz) * share) * t));
  m[P.wingLeft + 2] = flap;
  m[P.wingRight + 2] = -flap;
}
