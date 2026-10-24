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
const hat = (id: string): CosmeticArt => ({ slot: 'hat', art: `cosmetics/hats.glb#${id}`, licence: 'cosmetics/hats.glb' });
const outfit = (name: string): CosmeticArt => ({ slot: 'outfit', art: `palette:${name}`, licence: 'kenney-blocky.glb' });
const pet = (node: string): CosmeticArt => ({ slot: 'pet', art: `cosmetics/pets.glb#${node}`, licence: 'cosmetics/pets.glb' });

export const COSMETICS: Readonly<Record<string, CosmeticArt>> = {
  'hat-cap': hat('hat-cap'),
  'hat-beanie': hat('hat-beanie'),
  'hat-explorer': hat('hat-explorer'),
  'hat-crown': hat('hat-crown'),
  'hat-wizard': hat('hat-wizard'),
  'hat-pirate': hat('hat-pirate'),
  'hat-chef': hat('hat-chef'),
  'hat-astronaut': hat('hat-astronaut'),
  'hat-tophat': hat('hat-tophat'),
  'hat-party': hat('hat-party'),
  'hat-glasses': hat('hat-glasses'),
  'hat-sunglasses': hat('hat-sunglasses'),
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
