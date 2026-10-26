import type { Rewards } from '../domain/rewards';
import { isDone, type WorldData } from '../domain/types';
import { levelUp } from '../rewards/level-up';

/** Whether a `Player.onFeet` kick is the take-off of a jump (n 3); steps and landings come from `Footfall`. */
export function isJump(n: number): boolean {
  return n === 3;
}

/** Metres in one frame past which a move is a teleport, not a walk. */
const TELEPORT = 3;
/** Ground speed (m/s) under which the kid stands still. */
const STILL = 0.8;
/** Seconds in the air that make a landing audible. */
const MIN_AIR = 0.25;
/** Metres already "walked" when a walk starts, so the first step falls soon after. */
const FIRST_STEP = 0.8;

/** Footsteps paced by the ground covered (a stride grows with speed) and landings after real air time. */
export class Footfall {
  private travelled = FIRST_STEP;
  private air = 0;
  private x = Number.NaN;
  private z = Number.NaN;
  /** Air time (s) before the last landing. */
  landedAfter = 0;

  /** Feeds one frame of the feet; returns the sound it makes, if any. */
  update(x: number, z: number, grounded: boolean, dt: number): 'step' | 'land' | null {
    let d = Number.isNaN(this.x) ? 0 : Math.hypot(x - this.x, z - this.z);
    this.x = x;
    this.z = z;
    if (d > TELEPORT) d = 0;
    if (!grounded) {
      this.air += dt;
      return null;
    }
    const air = this.air;
    this.air = 0;
    if (air > MIN_AIR) {
      this.landedAfter = air;
      this.travelled = 0;
      return 'land';
    }
    const speed = dt > 0 ? d / dt : 0;
    if (speed < STILL) {
      this.travelled = FIRST_STEP;
      return null;
    }
    this.travelled += d;
    const stride = 0.9 + speed * 0.12;
    if (this.travelled < stride) return null;
    this.travelled -= stride;
    return 'step';
  }
}

/** Ids of the activities counted as done. */
export function doneIds(world: WorldData): Set<number> {
  const ids = new Set<number>();
  for (const s of world.sections) for (const a of s.activities) if (isDone(a.completion)) ids.add(a.id);
  return ids;
}

/** Whether an activity became done between two reads of the course. */
export function newlyDone(before: ReadonlySet<number>, after: ReadonlySet<number>): boolean {
  for (const id of after) if (!before.has(id)) return true;
  return false;
}

/** The rewards sound between two reads: a level-up, else XP gained; nothing on the first read. */
export function rewardCue(previous: Rewards | null, next: Rewards): 'levelup' | 'xp' | null {
  if (!previous || !next.enabled) return null;
  if (levelUp(previous, next)) return 'levelup';
  return next.xp > previous.xp ? 'xp' : null;
}

/** What decides the bus levels. */
export interface MixState {
  readonly on: boolean;
  readonly volume: number;
  /** A video panel is open: everything is silent. */
  readonly video: boolean;
  /** Another panel (page, quiz, book) is open: the music steps back. */
  readonly panel: boolean;
  /** The tab is hidden. */
  readonly hidden: boolean;
}

/** Master and music levels for a mix state; the slider is squared so its middle sounds like the middle. */
export function mixGains(m: MixState): { readonly master: number; readonly music: number } {
  const master = m.on && !m.video && !m.hidden ? m.volume * m.volume : 0;
  return { master, music: m.panel ? 0.45 : 1 };
}
