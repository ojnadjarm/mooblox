import type { Look, Rewards } from '../domain/rewards';
import { COSMETICS } from '../rewards/catalog';
import { itemName } from '../rewards/item-names';
import { fill } from './hud-model';

export type WardrobeSlot = keyof Look;

/** Wardrobe texts; `{quest}` is the quest sentence that unlocks an item. */
export interface WardrobeStrings {
  readonly wardrobe_tab: string;
  readonly wardrobe_hat: string;
  readonly wardrobe_outfit: string;
  readonly wardrobe_pet: string;
  readonly wardrobe_none: string;
  readonly wardrobe_byquest: string;
  readonly wardrobe_bylevel: string;
}

export const DEFAULT_WARDROBE_STRINGS: WardrobeStrings = {
  wardrobe_tab: 'Wardrobe',
  wardrobe_hat: 'Hats',
  wardrobe_outfit: 'Outfits',
  wardrobe_pet: 'Pets',
  wardrobe_none: 'None',
  wardrobe_byquest: '{quest} to unlock',
  wardrobe_bylevel: 'Level up to unlock',
};

/** One item as the wardrobe shows it. */
export interface WardrobeItem {
  readonly id: string;
  readonly slot: WardrobeSlot;
  readonly name: string;
  readonly unlocked: boolean;
  /** How to unlock it (empty once unlocked): the quest that names it, else a level-up. */
  readonly hint: string;
}

export const WARDROBE_SLOTS: readonly WardrobeSlot[] = ['hat', 'outfit', 'pet'];

/** Every hat, outfit and pet in catalog order, unlocked or with the sentence that unlocks it; names from `lang`. */
export function wardrobeItems(rewards: Rewards, strings: WardrobeStrings, lang: Readonly<Record<string, string>> = {}): WardrobeItem[] {
  const owned = new Set(rewards.unlocks);
  return Object.entries(COSMETICS)
    .filter(([, art]) => (WARDROBE_SLOTS as readonly string[]).includes(art.slot))
    .map(([id, art]) => {
      const unlocked = owned.has(id);
      const quest = rewards.quests.find((q) => q.reward === id && !q.complete);
      const hint = unlocked ? '' : quest ? fill(strings.wardrobe_byquest, { quest: quest.text }) : strings.wardrobe_bylevel;
      return { id, slot: art.slot as WardrobeSlot, name: itemName(id, lang), unlocked, hint };
    });
}

/** `look` with `id` worn on `slot`, or taken off when it is already worn or null. */
export function toggle(look: Look, slot: WardrobeSlot, id: string | null): Look {
  return { ...look, [slot]: id === null || look[slot] === id ? null : id };
}
