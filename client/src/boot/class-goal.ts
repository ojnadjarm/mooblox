import { Box3, Mesh, Vector3 } from 'three';
import type { ClassGoal } from '../domain/rewards';
import { BvhCollider } from '../player/collider';
import type { RewardsStore } from '../rewards/rewards-store';
import { CollectToast } from '../ui/collect-toast';
import { goalBurst } from '../ui/goal-burst';
import { fill } from '../ui/hud-model';
import { Fireworks, type Burst } from '../world/fireworks';
import { MONUMENT_LAMPS, monumentGeometry } from '../world/monument';
import type { WorldView } from './app';

/** Class goal texts; `{target}` is filled in. */
export interface GoalStrings {
  readonly goal_reached: string;
  readonly goal_together: string;
}

export const DEFAULT_GOAL_STRINGS: GoalStrings = {
  goal_reached: 'Class goal reached!',
  goal_together: 'Together you finished {target} activities',
};

/** Sparks per show on the WebGL tiers (low gets the page burst). */
const SPARKS = { medium: 600, high: 1500, xhigh: 3000 } as const;
/** Wait after the world shows before the show starts, ms. */
const DELAY = 1200;

/** The running class goal: the monument and the shows played so far. */
export interface ClassGoalRuntime {
  readonly monument: Mesh | null;
  /** Firework shows started on this page. */
  readonly shows: number;
}

const seenKey = (courseId: number): string => `mooblox-goal-${courseId}`;

/** Whether this browser already celebrated the goal of that week (a failing storage counts as not seen). */
function seen(courseId: number, week: number): boolean {
  try {
    return localStorage.getItem(seenKey(courseId)) === String(week);
  } catch {
    return false;
  }
}

function markSeen(courseId: number, week: number): void {
  try {
    localStorage.setItem(seenKey(courseId), String(week));
  } catch {
    // Without storage the show plays once per page.
  }
}

/**
 * Builds the class goal monument on the spawn plaza (its lanterns show the shared progress, all lit with the star once
 * reached) and celebrates a reached goal with fireworks once per week per browser.
 */
export function startClassGoal(view: WorldView, store: RewardsStore, courseId: number, strings: Partial<GoalStrings> = {}): ClassGoalRuntime {
  const s = { ...DEFAULT_GOAL_STRINGS, ...strings };
  const toast = new CollectToast(view.stage.canvasHost);
  let solid: Mesh | null = null;
  let unhook: (() => void) | null = null;
  let builtFor = '';
  let shows = 0;
  let celebrated = -1;

  const clear = (): void => {
    unhook?.();
    unhook = null;
    solid?.removeFromParent();
    solid?.geometry.dispose();
    solid = null;
  };

  const build = (goal: ClassGoal | null): void => {
    const site = view.dressing.monument;
    const lit = goal ? Math.floor((goal.progress / Math.max(1, goal.target)) * MONUMENT_LAMPS) : 0;
    const key = site && goal ? `${site.x},${site.z}|${lit}|${goal.reached}` : '';
    if (key === builtFor) return;
    builtFor = key;
    clear();
    if (!site || !goal) return;
    solid = new Mesh(monumentGeometry(site, lit, goal.reached), view.kit.plastic);
    solid.name = 'monument';
    solid.userData['reached'] = goal.reached;
    // xhigh already draws it twice (the GTAO normal pass): a shadow too would break the draw budget.
    solid.castShadow = view.quality.tier === 'high';
    solid.receiveShadow = true;
    view.stage.add(solid);
    solid.updateMatrixWorld(true);
    unhook = view.collider.addStatic({ collider: BvhCollider.fromMeshes([solid]), bounds: new Box3().setFromObject(solid) });
    view.gate.invalidate();
  };

  /** Fireworks in front of the camera (page sparks on the low tier, nothing but the toast with reduced motion). */
  const celebrate = (goal: ClassGoal): void => {
    shows++;
    toast.show('star', s.goal_reached, fill(s.goal_together, { target: goal.target }));
    const tier = view.quality.tier;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (tier === 'low') {
      goalBurst(view.stage.canvasHost);
      return;
    }
    const cam = view.stage.camera;
    const dir = cam.getWorldDirection(new Vector3());
    const len = Math.hypot(dir.x, dir.z);
    const [fx, fz] = len > 0.1 ? [dir.x / len, dir.z / len] : [0, -1];
    const bursts: Burst[] = [-1, 0, 1, 0.5, -0.5, 0].map((side, i) => ({
      x: cam.position.x + fx * 24 - fz * side * 9,
      y: 13 + (i % 3) * 2.5,
      z: cam.position.z + fz * 24 + fx * side * 9,
    }));
    const show = new Fireworks(SPARKS[tier], bursts);
    view.stage.add(show.points);
    const stop = view.onFrame((dt) => {
      if (!show.step(dt)) {
        stop();
        show.dispose();
      }
      view.gate.invalidate();
    });
  };

  const update = (): void => {
    const goal = store.rewards?.goal ?? null;
    build(goal);
    if (goal?.reached && celebrated !== goal.week && !seen(courseId, goal.week)) {
      celebrated = goal.week;
      markSeen(courseId, goal.week);
      window.setTimeout(() => celebrate(goal), DELAY);
    }
  };

  store.subscribe(update);
  view.onRebuild(() => {
    builtFor = '';
    update();
  });
  update();
  return {
    get monument() {
      return solid;
    },
    get shows() {
      return shows;
    },
  };
}
