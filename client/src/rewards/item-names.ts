import { COSMETICS } from './catalog';

/** English names of the catalog items; play.php passes `item_<id with _>` lang strings over them. */
const NAMES: Readonly<Record<string, string>> = {
  'hat-cap': 'Cap',
  'hat-beanie': 'Beanie',
  'hat-explorer': 'Explorer hat',
  'hat-crown': 'Crown',
  'hat-wizard': 'Wizard hat',
  'hat-pirate': 'Pirate hat',
  'hat-chef': 'Chef hat',
  'hat-astronaut': 'Space helmet',
  'hat-tophat': 'Top hat',
  'hat-party': 'Party hat',
  'hat-glasses': 'Glasses',
  'hat-sunglasses': 'Sunglasses',
  'outfit-lava': 'Lava outfit',
  'outfit-ocean': 'Ocean outfit',
  'outfit-forest': 'Forest outfit',
  'outfit-sunset': 'Sunset outfit',
  'outfit-space': 'Space outfit',
  'outfit-candy': 'Candy outfit',
  'outfit-gold': 'Gold outfit',
  'outfit-snow': 'Snow outfit',
  'outfit-night': 'Night outfit',
  'pet-cat': 'Cat',
  'pet-dog': 'Dog',
  'pet-bunny': 'Bunny',
  'pet-fox': 'Fox',
  'pet-panda': 'Panda',
  'pet-penguin': 'Penguin',
  'trophy-bronze': 'Bronze trophy',
  'trophy-silver': 'Silver trophy',
  'trophy-gold': 'Gold trophy',
};

/** Lang key of an item name (`hat-cap` → `item_hat_cap`). */
export const itemKey = (id: string): string => `item_${id.replaceAll('-', '_')}`;

/** Every catalog item's lang key and English name, for play.php's string list and the defaults. */
export const ITEM_NAMES: Readonly<Record<string, string>> = Object.fromEntries(Object.keys(COSMETICS).map((id) => [itemKey(id), NAMES[id] ?? id]));

/** The display name of an item from `strings` (lang) or the English default. */
export function itemName(id: string, strings: Readonly<Record<string, string>> = {}): string {
  return strings[itemKey(id)] ?? ITEM_NAMES[itemKey(id)] ?? id;
}
