/** Pure reactions of ambient critters to the player: ducks and butterflies flee, cats stop and watch (and dart off when run at), dogs trot over. */

/** How one kind of critter reacts: when it notices the player, what it does, and how it moves while doing it. */
export interface CritterTune {
  /** Notices the player within this many metres, lets go past `release`. */
  readonly notice: number;
  readonly release: number;
  /** 'flee' keeps away, 'watch' stops and looks (darts off when startled), 'approach' comes to stand `keep` m from the player. */
  readonly mode: 'flee' | 'watch' | 'approach';
  /** Flight starts inside this many metres of the player (flee, and a startled watcher). */
  readonly flee: number;
  /** Push (m/s²) at the player's feet, spring rate (1/s) back to its own wander, top speed (m/s) of the reaction. */
  readonly push: number;
  readonly spring: number;
  readonly top: number;
  readonly keep: number;
  /** Furthest (m) the reaction carries it from its own wander. */
  readonly leash: number;
  /** A watcher darts off when the player comes this near at `startleSpeed` m/s or more. */
  readonly startleNear: number;
  readonly startleSpeed: number;
  /** Rise (m) when alarmed, hop height (m) when happy, turn rate (1/s). */
  readonly lift: number;
  readonly hop: number;
  readonly turn: number;
  /** How much of its wander it pauses while alert (0 keeps wandering, 1 stops). */
  readonly stop: number;
}

export type CritterKind = 'duck' | 'cat' | 'dog' | 'butterfly';

/** Tuning per critter kind. */
export const CRITTERS: Readonly<Record<CritterKind, CritterTune>> = {
  duck: { notice: 4.5, release: 6.5, mode: 'flee', flee: 4.5, push: 9, spring: 0.5, top: 2.4, keep: 0, leash: 3.2, startleNear: 0, startleSpeed: Infinity, lift: 0, hop: 0, turn: 6, stop: 0 },
  cat: { notice: 5, release: 7, mode: 'watch', flee: 3.5, push: 30, spring: 0.7, top: 5, keep: 0, leash: 3, startleNear: 2, startleSpeed: 3.5, lift: 0, hop: 0, turn: 5, stop: 1 },
  dog: { notice: 6, release: 9, mode: 'approach', flee: 0, push: 0, spring: 2.2, top: 4.2, keep: 1.5, leash: 5, startleNear: 0, startleSpeed: Infinity, lift: 0, hop: 0.14, turn: 7, stop: 1 },
  butterfly: { notice: 2.6, release: 4, mode: 'flee', flee: 2.6, push: 14, spring: 0.6, top: 3, keep: 0, leash: 2.5, startleNear: 0, startleSpeed: Infinity, lift: 1.3, hop: 0, turn: 8, stop: 0 },
};

/** Slots of one critter's reaction state (stride `C.size`): offset and its velocity, own wander clock, alert, rise, yaw, startle time, hop phase. */
export const C = { ox: 0, oz: 1, vx: 2, vz: 3, clock: 4, alert: 5, lift: 6, yaw: 7, startle: 8, hop: 9, size: 10 } as const;

/** Seconds a startled watcher runs before it settles; alert rise and fall rates (1/s). */
const STARTLE_TIME = 1.1;
const ALERT_UP = 5;
const ALERT_DOWN = 1.2;

/** Fresh state for `n` critters, each facing `yaw` 0 (set on the first step). */
export function critterState(n: number): Float64Array {
  const s = new Float64Array(n * C.size);
  for (let i = 0; i < n; i++) s[i * C.size + C.yaw] = NaN;
  return s;
}

/**
 * Steps critter `i` of `s` by dt: (bx, bz) is where its wander puts it now heading `heading`, (hx, hz) its home it stays within `roam`
 * of, (px, pz) the player moving at `pv` m/s (`near` false: no player). Writes offset, rise, yaw and alert; the caller adds dt times
 * `pace(s, i, tune)` to the wander clock. Returns true when it is calm (settled on its wander, the player past `release`). No allocation.
 */
export function reactStep(
  s: Float64Array,
  i: number,
  tune: CritterTune,
  bx: number,
  bz: number,
  heading: number,
  hx: number,
  hz: number,
  roam: number,
  near: boolean,
  px: number,
  pz: number,
  pv: number,
  dt: number,
): boolean {
  const o = i * C.size;
  let ox = s[o + C.ox]!;
  let oz = s[o + C.oz]!;
  let vx = s[o + C.vx]!;
  let vz = s[o + C.vz]!;
  const cx = bx + ox;
  const cz = bz + oz;
  const dx = cx - px;
  const dz = cz - pz;
  const d = near ? Math.sqrt(dx * dx + dz * dz) : Infinity;
  const ax = d > 1e-6 ? dx / d : 0;
  const az = d > 1e-6 ? dz / d : 1;
  let alert = s[o + C.alert]!;
  if (d > tune.release && alert < 1e-3 && Math.abs(ox) + Math.abs(oz) + Math.abs(vx) + Math.abs(vz) + s[o + C.lift]! < 1e-3) {
    s[o + C.ox] = s[o + C.oz] = s[o + C.vx] = s[o + C.vz] = s[o + C.alert] = s[o + C.lift] = s[o + C.hop] = s[o + C.startle] = 0;
    s[o + C.yaw] = heading;
    return true;
  }
  const wants = d < (alert > 0.5 ? tune.release : tune.notice) ? 1 : 0;
  alert += (wants - alert) * Math.min(1, (wants > alert ? ALERT_UP : ALERT_DOWN) * dt);
  let startle = Math.max(0, s[o + C.startle]! - dt);
  if (tune.mode === 'watch' && d < tune.startleNear && pv >= tune.startleSpeed) startle = STARTLE_TIME;
  let gx = 0;
  let gz = 0;
  if (tune.mode === 'approach' && alert > 0.05) {
    gx = alert * (px + ax * tune.keep - bx);
    gz = alert * (pz + az * tune.keep - bz);
  }
  const k = tune.spring;
  let fx = k * k * (gx - ox) - 2 * k * vx;
  let fz = k * k * (gz - oz) - 2 * k * vz;
  const flight = tune.mode === 'flee' || startle > 0 ? tune.flee : 0;
  if (d < flight) {
    const p = tune.push * (1 - d / flight);
    fx += ax * p;
    fz += az * p;
  }
  vx += fx * dt;
  vz += fz * dt;
  const v = Math.sqrt(vx * vx + vz * vz);
  if (v > tune.top) {
    vx *= tune.top / v;
    vz *= tune.top / v;
  }
  ox += vx * dt;
  oz += vz * dt;
  const ol = Math.sqrt(ox * ox + oz * oz);
  if (ol > tune.leash) {
    ox *= tune.leash / ol;
    oz *= tune.leash / ol;
  }
  const rx = bx + ox - hx;
  const rz = bz + oz - hz;
  const rl = Math.sqrt(rx * rx + rz * rz);
  if (rl > roam) {
    ox -= rx * (1 - roam / rl);
    oz -= rz * (1 - roam / rl);
  }
  const lift = s[o + C.lift]!;
  s[o + C.lift] = lift + (alert * tune.lift - lift) * Math.min(1, 2.5 * dt);
  const moving = Math.sqrt(vx * vx + vz * vz);
  let want = heading;
  if (moving > 0.6) want = Math.atan2(vx, vz);
  else if (alert > 0.5 && tune.mode !== 'flee') want = Math.atan2(-ax, -az);
  let yaw = s[o + C.yaw]!;
  if (yaw !== yaw) yaw = want;
  const turn = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
  yaw += turn * Math.min(1, tune.turn * dt);
  const happy = tune.hop > 0 && alert > 0.5 && moving < 1 ? alert : 0;
  s[o + C.hop] = happy > 0 ? s[o + C.hop]! + dt * 9 : 0;
  s[o + C.ox] = ox;
  s[o + C.oz] = oz;
  s[o + C.vx] = vx;
  s[o + C.vz] = vz;
  s[o + C.alert] = alert;
  s[o + C.startle] = startle;
  s[o + C.yaw] = yaw;
  return false;
}

/** How fast critter `i`'s wander clock runs now (1 = its usual wander, 0 = stopped while it watches or comes over). */
export function pace(s: Float64Array, i: number, tune: CritterTune): number {
  return 1 - tune.stop * s[i * C.size + C.alert]!;
}

/** Height (m) of critter `i` over its wander: alarmed rise plus a happy hop. */
export function rise(s: Float64Array, i: number, tune: CritterTune): number {
  const o = i * C.size;
  const h = s[o + C.hop]!;
  return s[o + C.lift]! + (h > 0 ? Math.abs(Math.sin(h)) * tune.hop : 0);
}

/**
 * Keeps critter `i` (wandering at (bx, bz)) on its ground: `area[from..from+3)` is the land disc (x, z, radius its centre stays within),
 * then (x, z, r) obstacle circles up to `to` it stays `body` m clear of. Pushes it out and drops the speed into what it met. No allocation.
 */
export function keepClear(s: Float64Array, i: number, bx: number, bz: number, area: Float64Array, from: number, to: number, body: number): void {
  const o = i * C.size;
  let ox = s[o + C.ox]!;
  let oz = s[o + C.oz]!;
  if (ox === 0 && oz === 0) return;
  let vx = s[o + C.vx]!;
  let vz = s[o + C.vz]!;
  for (let w = from; w < to; w += 3) {
    const dx = bx + ox - area[w]!;
    const dz = bz + oz - area[w + 1]!;
    const d = Math.sqrt(dx * dx + dz * dz);
    const land = w === from;
    const r = land ? area[w + 2]! : area[w + 2]! + body;
    if (land ? d <= r : d >= r) continue;
    const nx = d > 1e-9 ? dx / d : 1;
    const nz = d > 1e-9 ? dz / d : 0;
    ox += nx * (r - d);
    oz += nz * (r - d);
    const into = (vx * nx + vz * nz) * (land ? -1 : 1);
    if (into < 0) {
      const t = land ? -into : into;
      vx -= nx * t;
      vz -= nz * t;
    }
  }
  s[o + C.ox] = ox;
  s[o + C.oz] = oz;
  s[o + C.vx] = vx;
  s[o + C.vz] = vz;
}

/** Moves critter `i`'s offset by the push (px, pz) out of a solid it met (a cliff or wall) and drops its speed into that solid. No allocation. */
export function nudge(s: Float64Array, i: number, px: number, pz: number): void {
  const d = Math.sqrt(px * px + pz * pz);
  if (d < 1e-9) return;
  const o = i * C.size;
  s[o + C.ox] = s[o + C.ox]! + px;
  s[o + C.oz] = s[o + C.oz]! + pz;
  const into = (s[o + C.vx]! * px + s[o + C.vz]! * pz) / d;
  if (into < 0) {
    s[o + C.vx] = s[o + C.vx]! - (px / d) * into;
    s[o + C.vz] = s[o + C.vz]! - (pz / d) * into;
  }
}
