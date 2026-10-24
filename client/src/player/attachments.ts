import { NO_LOOK, type Look } from '../domain/rewards';
import type { Avatar } from './avatar';
import type { AvatarBody, AvatarFactory, AvatarLook } from './avatar-kit';
import type { Wearable } from './character/compose';
import type { CharacterLook } from './character/look';
import type { HatLibrary } from './hats';
import { toCharacter } from './look';

type Clothes = Pick<CharacterLook, 'top' | 'topc' | 'bottom' | 'bottomc' | 'shoes' | 'shoesc'>;

/** Each outfit item as a set of clothes (style and colour from the character catalogue). */
export const OUTFITS: Readonly<Record<string, Clothes>> = {
  'outfit-lava': { top: 'hoodie', topc: 'red', bottom: 'trousers', bottomc: 'black', shoes: 'boots', shoesc: 'orange' },
  'outfit-ocean': { top: 'stripes', topc: 'navy', bottom: 'shorts', bottomc: 'teal', shoes: 'sandals', shoesc: 'blue' },
  'outfit-forest': { top: 'hoodie', topc: 'green', bottom: 'trousers', bottomc: 'brown', shoes: 'boots', shoesc: 'brown' },
  'outfit-sunset': { top: 'tee', topc: 'orange', bottom: 'skirt', bottomc: 'pink', shoes: 'sneakers', shoesc: 'yellow' },
  'outfit-space': { top: 'longsleeve', topc: 'white', bottom: 'trousers', bottomc: 'grey', shoes: 'boots', shoesc: 'white' },
  'outfit-candy': { top: 'stripes', topc: 'pink', bottom: 'skirt', bottomc: 'purple', shoes: 'sneakers', shoesc: 'white' },
  'outfit-gold': { top: 'longsleeve', topc: 'yellow', bottom: 'trousers', bottomc: 'brown', shoes: 'boots', shoesc: 'yellow' },
  'outfit-snow': { top: 'hoodie', topc: 'white', bottom: 'trousers', bottomc: 'blue', shoes: 'boots', shoesc: 'white' },
  'outfit-night': { top: 'hoodie', topc: 'navy', bottom: 'trousers', bottomc: 'black', shoes: 'sneakers', shoesc: 'purple' },
};

/** Catalog items worn over the face instead of on top of the head. */
const FACE_ITEMS = new Set(['hat-glasses', 'hat-sunglasses']);

/** `look` in the clothes of `outfit` (unchanged without one). */
export function withOutfit(look: AvatarLook, outfit: string | null): AvatarLook {
  const clothes = outfit ? OUTFITS[outfit] : undefined;
  return clothes ? { ...toCharacter(look), ...clothes } : look;
}

/** The wearable of hat item `id` from `hats`: head-top hats hide the hair crown; glasses take the face slot. */
export function hatWearable(id: string | null, hats: HatLibrary | null): Wearable | null {
  const part = id && hats ? hats.part(id) : null;
  if (!id || !part) {
    return null;
  }
  return FACE_ITEMS.has(id) ? { id, slot: 'face', parts: () => [part] } : { id, slot: 'hat', parts: () => [part], hides: ['crown'] };
}

/** An avatar factory that dresses every avatar in the worn hat and outfit (the player's; the Guide uses the plain kit). */
export class Outfitter implements AvatarFactory {
  /** Items to dress in; the wardrobe swaps them while it previews. */
  worn: Look = NO_LOOK;
  hats: HatLibrary | null = null;

  constructor(private readonly kit: AvatarFactory) {}

  get bodies(): readonly AvatarBody[] {
    return this.kit.bodies;
  }

  create(look: AvatarLook, wearables: readonly Wearable[] = []): Promise<Avatar> {
    const hat = hatWearable(this.worn.hat, this.hats);
    return this.kit.create(withOutfit(look, this.worn.outfit), hat ? [...wearables, hat] : wearables);
  }
}
