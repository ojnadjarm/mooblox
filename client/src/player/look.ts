import type { AvatarLook } from './avatar-kit';
import { encodeCharacter, migrateLegacy, parseLook, type CharacterLook } from './character/look';

/** Any look as a character: T1302 looks migrate to their preset. */
export function toCharacter(look: AvatarLook): CharacterLook {
  return 'tint' in look ? migrateLegacy(look) : look;
}

/** Preference value of a look: compact versioned JSON. */
export function encodeLook(look: AvatarLook): string {
  return encodeCharacter(toCharacter(look));
}

/** Look from a preference value (JSON or a T1302 body); anything invalid gives the default character. */
export function decodeLook(value: string, _bodies?: readonly string[]): AvatarLook {
  return parseLook(value);
}
