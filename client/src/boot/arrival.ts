import { arrive, ARRIVE } from '../hub/warp';
import { WarpBeam } from '../hub/warp-beam';
import type { WhiteOut } from '../ui/white-out';
import type { HallSite } from '../world/dressing';
import type { PlayerRig, WorldView } from './app';

/** Where the kid lands beside the return portal, in its frame (front +z): in front of the right column, clear of the fluid. */
const BESIDE = { x: 1.1, z: 2.3 } as const;

/** Whether this page load enters the course (a course page link, a hub warp, a typed or bookmarked address, back/forward), not a reload. */
export function entersCourse(nav: { readonly type: string } | undefined = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined): boolean {
  return nav?.type !== 'reload';
}

/** The running arrival. */
export interface ArrivalRuntime {
  /** Seconds into the arrival, -1 once over (or never started). */
  readonly t: number;
}

/** The arrival spot beside a return portal site, facing out sideways (away from the portal, which the camera keeps in view); the world start when there is no portal. */
export function arrivalSpot(site: HallSite | null, start: { x: number; z: number; face: number }): { x: number; z: number; face: number } {
  if (!site) return start;
  const c = Math.cos(site.face);
  const s = Math.sin(site.face);
  return { x: site.x + BESIDE.x * c + BESIDE.z * s, z: site.z - BESIDE.x * s + BESIDE.z * c, face: site.face + Math.PI / 2 };
}

/**
 * The arrival on entering a course, the hub's warp out played backwards: the kid appears beside the course's return portal, drops
 * spinning out of the beam and grows back while the white-out clears, with the warp whoosh; then the controls come back.
 */
export function startArrival(view: WorldView, player: PlayerRig, whiteOut: WhiteOut, whoosh: () => void): ArrivalRuntime {
  const spot = arrivalSpot(view.dressing.portal, view.dressing.start);
  player.teleport(spot.x, spot.z, spot.face);
  const beam = new WarpBeam();
  view.stage.add(beam.mesh);
  player.freeze.frozen = true;
  whoosh();
  let t = 0;
  let spin = 0;
  const stop = view.onFrame((dt) => {
    t += dt;
    const pose = arrive(t);
    const root = player.avatar.root;
    const b = player.body.position;
    root.position.y += pose.lift;
    spin += dt * pose.spin;
    root.rotation.y += spin;
    root.scale.setScalar(pose.shrink);
    beam.set(b.x, b.y, b.z, pose.beam, pose.width);
    whiteOut.set(pose.flash);
    if (t < ARRIVE) return;
    t = -1;
    stop();
    whiteOut.set(0);
    root.scale.setScalar(1);
    player.freeze.frozen = false;
    beam.mesh.removeFromParent();
    beam.dispose();
  });
  return {
    get t() {
      return t;
    },
  };
}
