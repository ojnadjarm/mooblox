import { Box3, Mesh, type Material } from 'three';
import type { Rewards } from '../domain/rewards';
import { BvhCollider } from '../player/collider';
import type { RewardsStore } from '../rewards/rewards-store';
import { ATLAS_WHITE, TrophyAtlas, atlasCell, type AtlasEntry } from '../world/trophy-atlas';
import { hallCapacity, hallGeometry, metalOf, type Metal } from '../world/trophy-hall';
import type { WorldView } from './app';

/** The running trophy hall. */
export interface TrophyHallRuntime {
  /** The hall mesh; null when the hub has no site. */
  readonly mesh: Mesh | null;
  /** Badges standing on pedestals now. */
  readonly shown: number;
  dispose(): void;
}

/** The atlas entries for these trophies (oldest first): past the hall's capacity the last pedestal holds a "+N" plaque. */
export function hallEntries(trophies: Rewards['trophies'], capacity: number): AtlasEntry[] {
  if (!trophies.length) return [{ kind: 'empty' }];
  const sorted = [...trophies].sort((a, b) => a.timeIssued - b.timeIssued || a.badgeId - b.badgeId);
  const badges = sorted.length > capacity ? sorted.slice(0, capacity - 1) : sorted;
  const entries: AtlasEntry[] = badges.map((t) => ({ kind: 'badge', name: t.name, imageUrl: t.imageUrl }));
  if (sorted.length > capacity) entries.push({ kind: 'more', count: sorted.length - badges.length });
  return entries;
}

/** Builds the trophy hall on the hub's reserved site from the user's badges and keeps it in step; one draw, one atlas. */
export function startTrophyHall(view: WorldView, store: RewardsStore): TrophyHallRuntime {
  const atlas = new TrophyAtlas(() => view.gate.invalidate());
  const material: Material = view.kit.paintedPlastic(atlas.texture);
  material.customProgramCacheKey = () => 'mooblox-trophy-hall';
  let mesh: Mesh | null = null;
  let unhook: (() => void) | null = null;
  let builtFor = '';
  let shown = 0;

  const clear = (): void => {
    unhook?.();
    unhook = null;
    if (mesh) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh = null;
    }
    shown = 0;
  };

  const build = (): void => {
    const rewards = store.rewards;
    const site = view.dressing.hall;
    const key = site && rewards ? `${site.x},${site.z},${site.r}|${rewards.trophies.map((t) => `${t.badgeId}:${t.name}:${t.imageUrl}`).join(',')}` : '';
    if (key === builtFor) return;
    builtFor = key;
    clear();
    if (!site || !rewards) return;
    const entries = hallEntries(rewards.trophies, hallCapacity(site.r));
    const ids = [...rewards.trophies].sort((a, b) => a.timeIssued - b.timeIssued || a.badgeId - b.badgeId).map((t) => t.badgeId);
    const metals: Metal[] = entries.map((e, i) => (e.kind === 'badge' ? metalOf(ids[i]!) : e.kind === 'more' ? 'gold' : 'silver'));
    atlas.paint(entries);
    const { geometry } = hallGeometry(site, metals, entries.map((_, i) => atlasCell(i)), ATLAS_WHITE);
    mesh = new Mesh(geometry, material);
    mesh.name = 'trophy-hall';
    // xhigh already draws it twice (the GTAO normal pass): a shadow too would break the draw budget.
    mesh.castShadow = view.quality.tier === 'high';
    mesh.receiveShadow = true;
    view.stage.add(mesh);
    mesh.updateMatrixWorld(true);
    unhook = view.collider.addStatic({ collider: BvhCollider.fromMeshes([mesh]), bounds: new Box3().setFromObject(mesh) });
    shown = entries.filter((e) => e.kind === 'badge').length;
    view.gate.invalidate();
  };

  const unsubscribe = store.subscribe(build);
  const unrebuild = view.onRebuild(() => {
    builtFor = '';
    build();
  });
  build();
  return {
    get mesh() {
      return mesh;
    },
    get shown() {
      return shown;
    },
    dispose: () => {
      unsubscribe();
      unrebuild();
      clear();
      atlas.dispose();
      material.dispose();
    },
  };
}
