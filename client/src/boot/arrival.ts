import { Color, Mesh } from 'three';
import type { AudioEngine } from '../audio/engine';
import { bakeStillFluid, openingGeometry, paintOpening, portalFluidMaterial } from '../hub/portal-fluid';
import { EMERGE, emerge } from '../hub/warp';
import { WarpBeam } from '../hub/warp-beam';
import type { WhiteOut } from '../ui/white-out';
import type { PlayerRig, WorldView } from './app';
import { RETURN_COLOURS } from './return-portal';

/** How far behind the kid the arrival portal opens (m). */
const BEHIND = 1.4;

/** The running arrival. */
export interface ArrivalRuntime {
  /** Seconds into the arrival, -1 once over (or never started). */
  readonly t: number;
}

/**
 * The arrival after a hub warp: a portal of the same fluid opens behind the kid at the start, the kid steps out of it growing back
 * to size while the white-out clears and the beam drops (the hub's warp in), then the portal closes and the controls come back.
 */
export function startArrival(view: WorldView, player: PlayerRig, whiteOut: WhiteOut, engine: AudioEngine | null): ArrivalRuntime {
  const start = view.dressing.start;
  const fx = Math.sin(start.face);
  const fz = Math.cos(start.face);
  const px = start.x - fx * BEHIND;
  const pz = start.z - fz * BEHIND;
  const geometry = openingGeometry();
  paintOpening(geometry, 0, geometry.getAttribute('position').count, new Color(RETURN_COLOURS.fluid), true);
  const still = view.quality.tier === 'low';
  if (still) bakeStillFluid(geometry, new Color(RETURN_COLOURS.fluid));
  const material = still ? view.kit.glow : portalFluidMaterial(view.kit.time);
  const door = new Mesh(geometry, material);
  door.name = 'arrival-portal';
  door.renderOrder = 2;
  door.position.set(px, -0.3, pz);
  door.rotation.y = start.face;
  view.stage.add(door);
  const beam = new WarpBeam();
  view.stage.add(beam.mesh);
  player.freeze.frozen = true;
  engine?.play('warp');
  let t = 0;
  const stop = view.onFrame((dt) => {
    t += dt;
    const pose = emerge(t);
    const root = player.avatar.root;
    const back = (1 - pose.out) * BEHIND;
    root.position.x -= fx * back;
    root.position.z -= fz * back;
    root.scale.setScalar(pose.shrink);
    door.scale.set(pose.portal, pose.portal, 1);
    door.visible = pose.portal > 0.01;
    beam.set(root.position.x, root.position.y, root.position.z, pose.beam, pose.width);
    whiteOut.set(pose.flash);
    if (t < EMERGE) return;
    t = -1;
    stop();
    whiteOut.set(0);
    player.freeze.frozen = false;
    door.removeFromParent();
    geometry.dispose();
    if (!still) material.dispose();
    beam.mesh.removeFromParent();
    beam.dispose();
  });
  return {
    get t() {
      return t;
    },
  };
}
