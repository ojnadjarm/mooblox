import type { Collectible, Rewards } from '../domain/rewards';
import type { MoodleGateway } from '../moodle/gateway';
import type { Player } from '../player/player';
import type { RewardsStore } from '../rewards/rewards-store';
import { CollectToast } from '../ui/collect-toast';
import { fill } from '../ui/hud-model';
import { CollectibleLayer } from '../world/collectible-layer';
import { placeCollectibles, type CollectibleSpot } from '../world/collectibles';
import { WalkGrid } from '../world/walk-grid';
import type { WorldView } from './app';

/** Pick-up texts; `{found}` and `{total}` are filled in. */
export interface CollectStrings {
  readonly collect_gem: string;
  readonly collect_crystal: string;
  readonly collect_star: string;
  readonly collect_count: string;
}

export const DEFAULT_COLLECT_STRINGS: CollectStrings = {
  collect_gem: 'Gem found!',
  collect_crystal: 'Crystal found!',
  collect_star: 'Bonus star found!',
  collect_count: '{found} of {total} found',
};

/** Pick-up reach from the player's centre, metres. */
const REACH = 1.3;

/** The running collectibles: the world layer and its spots. */
export interface CollectiblesRuntime {
  readonly layer: CollectibleLayer;
  /** Every placed spot of the course (found or not). */
  readonly spots: readonly CollectibleSpot[];
  /** Called the moment the player walks through a collectible. */
  onPick: ((spot: CollectibleSpot) => void) | null;
}

/**
 * Puts the user's unlocked, not yet found collectibles into the world and picks them up as the player walks through them:
 * hidden at once, claimed on the server, then the store (the album) marks them found. Built only while rewards are on.
 */
export function startCollectibles(view: WorldView, player: Player, store: RewardsStore, gateway: MoodleGateway, courseId: number, strings: Partial<CollectStrings> = {}): CollectiblesRuntime {
  const s = { ...DEFAULT_COLLECT_STRINGS, ...strings };
  const layer = new CollectibleLayer(view.kit.time);
  view.stage.add(layer.group);
  const toast = new CollectToast(view.stage.canvasHost);
  let walk: WalkGrid | null = null;
  let all: CollectibleSpot[] = [];
  const pending = new Set<string>();
  let placedFor = '';

  const place = (rewards: Rewards): void => {
    const unlocked = rewards.collectibles.filter((c) => c.unlocked);
    const key = `${view.layout.extent}|${unlocked.map((c) => c.key).join(',')}`;
    if (key !== placedFor) {
      placedFor = key;
      walk ??= new WalkGrid(view.layout, view.dressing);
      all = placeCollectibles(view.layout, view.dressing.occupancy, walk, courseId, unlocked);
    }
    const found = new Set(rewards.collectibles.filter((c) => c.found).map((c) => c.key));
    layer.set(all.filter((sp) => !found.has(sp.key) && !pending.has(sp.key)));
    view.gate.invalidate();
  };

  const markFound = (key: string, count: number): void => {
    const r = store.rewards;
    if (!r) return;
    const collectibles: Collectible[] = r.collectibles.map((c) => (c.key === key ? { ...c, found: true } : c));
    store.set({ ...r, collectibles });
    const total = collectibles.filter((c) => c.unlocked).length;
    const kind = collectibles.find((c) => c.key === key)?.kind ?? 'gem';
    toast.show(kind, s[`collect_${kind}`], fill(s.collect_count, { found: count, total }));
  };

  const pick = (spot: CollectibleSpot): void => {
    pending.add(spot.key);
    layer.remove(spot.key);
    view.sparkle(spot.x, 1.1, spot.z);
    runtime.onPick?.(spot);
    gateway
      .claimCollectible(courseId, spot.key)
      .then((count) => {
        pending.delete(spot.key);
        markFound(spot.key, count);
      })
      .catch((e: unknown) => {
        pending.delete(spot.key);
        console.error('mooblox: claiming a collectible failed', e);
        if (store.rewards) place(store.rewards);
      });
  };

  store.subscribe((next) => {
    if (next.enabled) place(next);
  });
  if (store.rewards?.enabled) place(store.rewards);
  view.onRebuild(() => {
    walk = null;
    placedFor = '';
    if (store.rewards) place(store.rewards);
  });
  view.onFrame(() => {
    const cam = view.stage.camera.position;
    if (layer.update(cam.x, cam.z, view.quality.tier)) view.gate.invalidate();
    const p = player.avatar.root.position;
    const hit = layer.touching(p.x, p.z, REACH);
    if (hit && p.y < 2.5) pick(hit);
  });
  const runtime: CollectiblesRuntime = {
    layer,
    get spots() {
      return all;
    },
    onPick: null,
  };
  return runtime;
}
