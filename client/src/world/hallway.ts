import { Physics } from '../player/controller';

/** Fog factor (0 clear, 1 fully hazed) from which an island's real content may switch on unseen. */
export const POP_FOG = 0.8;
/** Seconds of building the low tier may still need when the kid reaches a bridge, on top of the worst measured build. */
export const HALLWAY_MARGIN_S = 1;

/** One island-change event: a build that finished, a safety-net build inline, or real content switching on. */
export interface HallwayEvent {
  readonly kind: 'ready' | 'inline' | 'show';
  readonly island: number;
  /** Page time (ms). */
  readonly t: number;
  /** Build time (ms): first slice to done for `ready`, the inline frame's build for `inline`. */
  readonly ms?: number;
  /** Fog factor at the island's nearest rim when its content switched on (`show`). */
  readonly fog?: number;
}

/**
 * The island changes of one session: how long each neighbour island took to build in the background, which ones the safety
 * net had to finish inline (a long frame), and how deep in the haze each island's real content switched on (under POP_FOG it
 * is a visible pop). Read by the dev probe, `tools/crossing.mjs` and the perf gate.
 */
export class HallwayLog {
  readonly events: HallwayEvent[] = [];
  private readonly started = new Map<number, number>();

  /** A background build slice ran for island i (the first one starts its build clock). */
  step(i: number, t: number): void {
    if (!this.started.has(i)) this.started.set(i, t);
  }

  /** Island i finished building in the background. */
  ready(i: number, t: number): void {
    const t0 = this.started.get(i) ?? t;
    this.started.delete(i);
    this.events.push({ kind: 'ready', island: i, t, ms: t - t0 });
  }

  /** The safety net built island i inline because the kid reached it first. */
  inline(i: number, t: number, ms: number): void {
    this.started.delete(i);
    this.events.push({ kind: 'inline', island: i, t, ms });
  }

  /** Island i's real content switched on at fog factor `fog` on its nearest rim. */
  show(i: number, t: number, fog: number): void {
    this.events.push({ kind: 'show', island: i, t, fog });
  }

  /** Worst background build (ms), safety-net builds and visible pops (inline builds plus switch-ons under POP_FOG). */
  summary(): { builds: number; worstBuildMs: number; inline: number; pops: number } {
    let worst = 0;
    let builds = 0;
    let inline = 0;
    let pops = 0;
    for (const e of this.events) {
      if (e.kind === 'ready') {
        builds++;
        worst = Math.max(worst, e.ms!);
      } else if (e.kind === 'inline') {
        inline++;
        pops++;
      } else if (e.fog! < POP_FOG) {
        pops++;
      }
    }
    return { builds, worstBuildMs: Math.round(worst), inline, pops };
  }
}

/** Bridge length (m) that gives the low tier `buildS` seconds plus the margin to build the island across at run speed. */
export function hallwayLength(buildS: number, runSpeed: number, margin = HALLWAY_MARGIN_S): number {
  return Math.ceil(runSpeed * (buildS + margin));
}

/** Worst background build (s) of one island on the low tier (Iris Xe, DPR 1, 4x CPU), measured with tools/crossing.mjs (T1394: 8x12, 1.82 s). */
export const LOW_BUILD_S = 1.9;
/** Haze band (m past the bubble edge) when far islands show as impostors or silhouettes: clear up to `near`, hazed at `far`. */
export const HAZE_BAND = { near: 10, far: 48 } as const;

/** Bridge length (m) that puts the island across at fog `fog` while the kid still stands on the near rim (bubble on that island). */
export function hiddenLength(band: { readonly near: number; readonly far: number }, fog = POP_FOG): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const x = (lo + hi) / 2;
    if (x * x * (3 - 2 * x) < fog) lo = x;
    else hi = x;
  }
  return band.near + hi * (band.far - band.near);
}

/** Every bridge is at least this long (m): the island across builds during the walk and switches on deep in the haze. */
export const HALLWAY = Math.max(hallwayLength(LOW_BUILD_S, Physics.run), Math.ceil(hiddenLength(HAZE_BAND)));
