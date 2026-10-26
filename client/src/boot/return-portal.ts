import { Box3, BufferGeometry, Color, Group, Mesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AudioEngine } from '../audio/engine';
import { archParts, inOpening, toArch } from '../hub/portal-arch';
import { bakeStillFluid, openingGeometry, paintOpening, portalFluidMaterial } from '../hub/portal-fluid';
import { Dwell, WARP_OUT, warpOut } from '../hub/warp';
import { WarpBeam } from '../hub/warp-beam';
import { BvhCollider } from '../player/collider';
import { CAMPUS } from '../world/look';
import type { HallSite } from '../world/dressing';
import type { WhiteOut } from '../ui/white-out';
import type { PlayerRig, WorldView } from './app';

/** The return portal's frame accent, its shade and the fluid tint: the hub's teal. */
export const RETURN_COLOURS = { accent: 0x2fa39a, shade: 0x1f6f69, fluid: 0x3fd6c6 } as const;

/** What the return portal needs from its host page. */
export interface ReturnPortalDeps {
  /** The hub page (index.php?from=<course>). */
  readonly huburl: string;
  readonly navigate: (url: string) => void;
  readonly whiteOut: WhiteOut;
  /** The world's sound engine (warp whoosh), when started. */
  readonly engine: () => AudioEngine | null;
}

/** The running return portal. */
export interface ReturnPortalRuntime {
  /** Where it stands; null when the spawn hub had no room. */
  readonly site: HallSite | null;
  /** Seconds into the warp back, -1 when none. */
  readonly warping: number;
}

/** A hub-style portal on the spawn island: walking through its fluid warps the kid back to the hub (beam, spin, white-out, whoosh). */
export function startReturnPortal(view: WorldView, player: PlayerRig, deps: ReturnPortalDeps): ReturnPortalRuntime {
  // The low tier keeps its program count: a still swirl in the glow program instead of the animated fluid.
  const still = view.quality.tier === 'low';
  const material = still ? view.kit.glow : portalFluidMaterial(view.kit.time);
  const group = new Group();
  group.name = 'return-portal';
  const beam = new WarpBeam();
  view.stage.add(beam.mesh);
  let site: HallSite | null = null;
  let unhook: (() => void) | null = null;
  const crossing = new Dwell(0);
  let warp = -1;
  let spin = 0;

  const build = (): void => {
    unhook?.();
    unhook = null;
    for (const m of [...group.children] as Mesh[]) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    site = view.dressing.portal;
    if (!site) return;
    const frame = new Mesh(returnPortalGeometry(), view.kit.plastic);
    frame.name = 'return-portal-frame';
    frame.castShadow = view.quality.tier !== 'low';
    frame.receiveShadow = true;
    const fluid = openingGeometry();
    paintOpening(fluid, 0, fluid.getAttribute('position').count, new Color(RETURN_COLOURS.fluid), true);
    if (still) bakeStillFluid(fluid, new Color(RETURN_COLOURS.fluid));
    const surface = new Mesh(fluid, material);
    surface.name = 'return-portal-fluid';
    surface.renderOrder = 2;
    group.add(frame, surface);
    group.position.set(site.x, 0, site.z);
    group.rotation.y = site.face;
    group.updateMatrixWorld(true);
    unhook = view.collider.addStatic({ collider: BvhCollider.fromMeshes([frame]), bounds: new Box3().setFromObject(frame) });
  };
  build();
  view.stage.add(group);
  view.onRebuild(build);

  view.onFrame((dt) => {
    if (!site) return;
    group.visible = view.sees(site.x, site.z);
    const b = player.body.position;
    if (warp < 0) {
      const l = toArch(site.x, site.z, site.face, b.x, b.y, b.z);
      if (!crossing.step(inOpening(l.x, l.y, l.z), true, dt)) return;
      warp = 0;
      player.freeze.frozen = true;
      player.guided.cancel();
      view.stage.canvasHost.closest('#mooblox-root')?.setAttribute('data-warping', '1');
      deps.engine()?.play('warp');
    }
    warp += dt;
    const pose = warpOut(warp);
    const root = player.avatar.root;
    beam.set(b.x, b.y, b.z, pose.beam, pose.width);
    root.position.y += pose.lift;
    spin += dt * pose.spin;
    root.rotation.y += spin;
    root.scale.setScalar(pose.shrink);
    deps.whiteOut.set(pose.flash);
    const host = view.stage.canvasHost.closest<HTMLElement>('#mooblox-root');
    if (warp >= WARP_OUT && host && !host.dataset['navigated']) {
      host.dataset['navigated'] = deps.huburl;
      deps.navigate(deps.huburl);
    }
  });
  return {
    get site() {
      return site;
    },
    get warping() {
      return warp;
    },
  };
}

/** The return portal's frame in its local space (front +z): the hub arch in the hub's teal, as one position-normal-colour geometry. */
export function returnPortalGeometry(): BufferGeometry {
  const p = CAMPUS.palette;
  const parts = archParts({ trim: p.trim, trimShade: p.trimShade, accent: RETURN_COLOURS.accent, shade: RETURN_COLOURS.shade });
  const g = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return g;
}
