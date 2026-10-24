import { CLOTH, EYE_COLOUR, HAIR_COLOUR, SKIN } from './catalog';
import { faceParts, glassesParts } from './face';
import { HAIRSTYLES } from './hair';
import type { CharacterLook } from './look';
import { lowerBody, upperBody } from './outfit';
import type { Part } from './parts';

/** Attachment slots; each holds at most one wearable. */
export type Slot = 'hat' | 'face' | 'back' | 'hand';

/** Something worn on a slot (unlockable hats, capes, held items): parts on rig bones, merged into the character mesh. */
export interface Wearable {
  readonly id: string;
  readonly slot: Slot;
  parts(look: CharacterLook): Part[];
  /** Hair a hat replaces: `crown` drops the hair above the head top. */
  readonly hides?: readonly 'crown'[];
}

/** Every part of a character: body, outfit, face, hair, glasses, then wearables (one per slot, the last wins). */
export function composeParts(look: CharacterLook, wearables: readonly Wearable[] = []): Part[] {
  const bySlot = new Map<Slot, Wearable>();
  for (const w of wearables) bySlot.set(w.slot, w);
  const worn = [...bySlot.values()];
  const hidden = new Set(worn.flatMap((w) => w.hides ?? []));
  const skin = SKIN[look.skin]!;
  const hairColour = HAIR_COLOUR[look.hairc]!;
  const hair = (HAIRSTYLES[look.hair] ?? HAIRSTYLES['short']!)(hairColour).filter((p) => p.kind === 'quad' || !p.tag || !hidden.has(p.tag));
  return [
    ...upperBody(look.top, CLOTH[look.topc]!, skin),
    ...lowerBody(look.bottom, CLOTH[look.bottomc]!, look.shoes, CLOTH[look.shoesc]!, skin),
    ...faceParts(look.eyes, EYE_COLOUR[look.eyec]!, look.brows, hairColour, look.mouth),
    ...hair,
    ...(bySlot.has('face') ? [] : glassesParts(look.glasses, CLOTH[look.glassesc]!)),
    ...worn.flatMap((w) => w.parts(look)),
  ];
}
