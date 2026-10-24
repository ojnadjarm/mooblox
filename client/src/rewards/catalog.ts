/** Cosmetic art keys, mirroring the ids of moodle/local/mooblox/classes/rewards/catalog.php. */
export type Slot = 'hat' | 'outfit' | 'pet' | 'trophy';

export interface CosmeticArt {
  readonly slot: Slot;
  /** `<asset file>#<node>`, `palette:<name>` or `boxes:<recipe>`. */
  readonly art: string;
  /** Key of the LICENSES.csv row that covers the art. */
  readonly licence: string;
}

const boxes = (slot: Slot, id: string): CosmeticArt => ({ slot, art: `boxes:${id}`, licence: 'built:boxes' });
const head = (node: string): CosmeticArt => ({ slot: 'hat', art: `cosmetics/head.glb#${node}`, licence: 'cosmetics/head.glb' });
const outfit = (name: string): CosmeticArt => ({ slot: 'outfit', art: `palette:${name}`, licence: 'kenney-blocky.glb' });
const pet = (node: string): CosmeticArt => ({ slot: 'pet', art: `cosmetics/pets.glb#${node}`, licence: 'cosmetics/pets.glb' });

export const COSMETICS: Readonly<Record<string, CosmeticArt>> = {
  'hat-cap': boxes('hat', 'cap'),
  'hat-beanie': boxes('hat', 'beanie'),
  'hat-explorer': boxes('hat', 'explorer'),
  'hat-crown': boxes('hat', 'crown'),
  'hat-wizard': boxes('hat', 'wizard'),
  'hat-pirate': boxes('hat', 'pirate'),
  'hat-chef': boxes('hat', 'chef'),
  'hat-astronaut': boxes('hat', 'astronaut'),
  'hat-tophat': boxes('hat', 'tophat'),
  'hat-party': boxes('hat', 'party'),
  'hat-glasses': head('aid-glasses'),
  'hat-sunglasses': head('aid-sunglasses'),
  'outfit-lava': outfit('lava'),
  'outfit-ocean': outfit('ocean'),
  'outfit-forest': outfit('forest'),
  'outfit-sunset': outfit('sunset'),
  'outfit-space': outfit('space'),
  'outfit-candy': outfit('candy'),
  'outfit-gold': outfit('gold'),
  'outfit-snow': outfit('snow'),
  'outfit-night': outfit('night'),
  'pet-cat': pet('animal-cat'),
  'pet-dog': pet('animal-dog'),
  'pet-bunny': pet('animal-bunny'),
  'pet-fox': pet('animal-fox'),
  'pet-panda': pet('animal-panda'),
  'pet-penguin': pet('animal-penguin'),
  'trophy-bronze': boxes('trophy', 'bronze'),
  'trophy-silver': boxes('trophy', 'silver'),
  'trophy-gold': boxes('trophy', 'gold'),
};
