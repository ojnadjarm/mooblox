import { Color, SRGBColorSpace } from 'three';
import { Surface, type SurfaceId } from './surfaces';

/** What a kit model part is made of: decides the atlas layer it is tagged with at bake and the layers it may draw with. */
export type Family = 'wood' | 'bark' | 'stone' | 'iron' | 'leaves' | 'hedge' | 'soil' | 'straw' | 'plaster' | 'roof' | 'brick' | 'cloth' | 'smooth';

/** Per family: the layer a part is tagged with, and every painted layer it may show (plain and metal paint nothing: always fine). */
export const FAMILIES: Readonly<Record<Family, { readonly tag: SurfaceId; readonly layers: readonly SurfaceId[] }>> = {
  wood: { tag: Surface.wood, layers: [Surface.wood, Surface.bark] },
  bark: { tag: Surface.bark, layers: [Surface.bark, Surface.wood] },
  stone: { tag: Surface.rock, layers: [Surface.rock, Surface.cliff, Surface.paving] },
  // Cast iron (lamps, hoops, nails): the rock layer's mottle.
  iron: { tag: Surface.rock, layers: [Surface.rock] },
  leaves: { tag: Surface.foliage, layers: [Surface.foliage, Surface.hedge, Surface.grass, Surface.meadow] },
  hedge: { tag: Surface.hedge, layers: [Surface.hedge, Surface.foliage] },
  soil: { tag: Surface.ground, layers: [Surface.ground, Surface.sand, Surface.rock] },
  straw: { tag: Surface.wood, layers: [Surface.wood, Surface.bark, Surface.foliage] },
  plaster: { tag: Surface.plaster, layers: [Surface.plaster] },
  roof: { tag: Surface.roof, layers: [Surface.roof] },
  brick: { tag: Surface.brick, layers: [Surface.brick, Surface.floor] },
  cloth: { tag: Surface.cloth, layers: [Surface.cloth] },
  // Glass, water, embers, petals, caps, produce, paint: smooth plastic, no painted pattern.
  smooth: { tag: Surface.metal, layers: [] },
};

/** True when a part of this family may draw with this layer. */
export function fits(family: Family, layer: SurfaceId): boolean {
  return layer === Surface.plain || layer === Surface.metal || FAMILIES[family].layers.includes(layer);
}

const c = new Color();
const hsl = { h: 0, s: 0, l: 0 };

/** The colour words the rules read, from a linear colour (hue, saturation and lightness in sRGB). */
function tone(r: number, g: number, b: number): { green: boolean; warm: boolean; brown: boolean; pale: boolean } {
  c.setRGB(r, g, b).getHSL(hsl, SRGBColorSpace);
  const green = hsl.s > 0.2 && hsl.h > 0.2 && hsl.h < 0.5;
  const warm = hsl.s > 0.2 && (hsl.h < 0.14 || hsl.h > 0.96);
  const pale = hsl.l > 0.82 || (hsl.s < 0.25 && hsl.l > 0.7);
  return { green, warm, brown: hsl.s > 0.2 && hsl.h > 0.02 && hsl.h < 0.13 && !pale, pale };
}

const LEAF = /^(leafs(?!Fall)|grass|sprout|melon-stem|moss)/;

/** Kinds of kit model by name, first match wins; each resolves a part (source material name, baked linear colour) to its family. */
const KINDS: readonly { readonly name: RegExp; readonly family: (mat: string, r: number, g: number, b: number) => Family }[] = [
  { name: /hedge/, family: (_m, r, g, b) => (tone(r, g, b).green ? 'hedge' : 'wood') },
  { name: /tree|palm/, family: (m, r, g, b) => (LEAF.test(m) || tone(r, g, b).green ? 'leaves' : 'bark') },
  { name: /^crop_melon/, family: (m) => (m === 'melon-stem' ? 'leaves' : m === 'woodBark' ? 'soil' : 'smooth') },
  { name: /^crop/, family: (m) => (LEAF.test(m) ? 'leaves' : /dirt|woodBark/.test(m) ? 'soil' : /woodInner|_defaultMat/.test(m) ? 'straw' : 'smooth') },
  { name: /plant_|bush|grass|flower|lily|mushroom/, family: (m, r, g, b) => (LEAF.test(m) || tone(r, g, b).green ? 'leaves' : 'smooth') },
  { name: /pot_large/, family: (m) => (LEAF.test(m) ? 'leaves' : 'wood') },
  { name: /campfire/, family: (m) => (m === 'stone' ? 'stone' : m === 'campfire-log' ? 'wood' : 'smooth') },
  { name: /rock|cliff|stone|statue/, family: (m, r, g, b) => (LEAF.test(m) || tone(r, g, b).green ? 'leaves' : 'stone') },
  { name: /fountain|planter/, family: (m, r, g, b) => (m === 'Water' ? 'smooth' : tone(r, g, b).green ? 'leaves' : tone(r, g, b).warm ? 'smooth' : 'stone') },
  { name: /log|stump/, family: (m) => (/woodInner/.test(m) ? 'wood' : 'bark') },
  { name: /tent/, family: (m) => (/^color/.test(m) ? 'cloth' : 'wood') },
  { name: /stall-green|stall-red|banner/, family: (_m, r, g, b) => (tone(r, g, b).brown ? 'wood' : 'cloth') },
  { name: /flag|ship/, family: (_m, r, g, b) => (tone(r, g, b).brown ? 'wood' : tone(r, g, b).pale ? 'cloth' : 'iron') },
  { name: /lantern|lamp/, family: (_m, r, g, b) => (tone(r, g, b).pale ? 'smooth' : 'iron') },
  { name: /building|house/, family: buildingPart },
  { name: /bridge|fence|sign|dock|platform|boat|canoe|crate|barrel|cart|bench|stool|plank/, family: (m, r, g, b) => (/^(wood|deck|dirt)/.test(m) || tone(r, g, b).warm ? 'wood' : m === '_defaultMat' ? 'smooth' : 'iron') },
];

/** Kit houses: cream walls plaster, plinth and quoins stone, frames and doors timber, green faces roof; window glass, rooms behind it and iron smooth. */
function buildingPart(m: string, r: number, g: number, b: number): Family {
  if (m === 'interior') return 'smooth';
  if (/cream/.test(m)) return 'plaster';
  if (/stone|plinth/.test(m)) return 'stone';
  if (/timber|door/.test(m)) return 'wood';
  if (/iron|seam/.test(m)) return 'iron';
  const t = tone(r, g, b);
  if (t.green) return 'roof';
  if (t.pale) return 'plaster';
  c.setRGB(r, g, b).getHSL(hsl, SRGBColorSpace);
  if (hsl.h > 0.5 && hsl.h < 0.7 && hsl.l > 0.6) return 'smooth';
  if (hsl.s < 0.25) return 'stone';
  if (t.warm && hsl.l < 0.45) return 'wood';
  return 'roof';
}

/** Family of one part of a kit model (`pack/name`), or null when no kind covers the model. */
export function familyOf(id: string, mat: string, r: number, g: number, b: number): Family | null {
  const name = id.slice(id.indexOf('/') + 1);
  const kind = KINDS.find((k) => k.name.test(name));
  return kind ? kind.family(mat, r, g, b) : null;
}
