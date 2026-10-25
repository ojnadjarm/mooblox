import { BufferAttribute, Color, type BufferGeometry } from 'three';

/** Material class of a vertex: the layer of the painted surface atlas it shows (`world/surface-atlas.ts`). */
export const Surface = {
  plain: 0, grass: 1, foliage: 2, wood: 3, rock: 4, roof: 5, plaster: 6, brick: 7, ground: 8, metal: 9,
  sand: 10, paving: 11, meadow: 12, cliff: 13, bark: 14, hedge: 15, floor: 16,
} as const;
export type SurfaceId = (typeof Surface)[keyof typeof Surface];

/** Per atlas layer (index = surface id): metres one tile covers and how strongly it marks the vertex colour. */
export const ATLAS_LAYERS: readonly { readonly metres: number; readonly strength: number }[] = [
  { metres: 3, strength: 0 },
  { metres: 2.4, strength: 0.95 },
  { metres: 1.1, strength: 0.7 },
  { metres: 1.6, strength: 0.8 },
  { metres: 2.2, strength: 0.7 },
  { metres: 1.4, strength: 0.8 },
  { metres: 2.6, strength: 0.45 },
  { metres: 1.6, strength: 0.75 },
  { metres: 2.2, strength: 0.85 },
  { metres: 3, strength: 0 },
  { metres: 3, strength: 0.55 },
  { metres: 2, strength: 0.7 },
  { metres: 2.4, strength: 0.75 },
  { metres: 2.6, strength: 0.7 },
  { metres: 1.2, strength: 0.85 },
  { metres: 1.3, strength: 0.75 },
  { metres: 2.4, strength: 0.9 },
];

/** Lawn swathes: metres one tone tile covers and the colour gain per unit of tone (deeper blue-green to sunnier yellow-green). */
export const LAWN_TONE = { metres: 21, gain: [1.2, 0.95, 0.5] } as const;

const hsl = { h: 0, s: 0, l: 0 };
const c = new Color();

/** Surface of one vertex from the model it belongs to (pack/name, or '' for terrain) and its baked linear colour. */
export function surfaceOf(id: string, r: number, g: number, b: number): SurfaceId {
  c.setRGB(r, g, b);
  c.getHSL(hsl);
  const green = g > r * 1.08 && g > b;
  const dark = hsl.l < 0.06;
  const brown = hsl.h > 0.02 && hsl.h < 0.13 && hsl.s > 0.2;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const name = id.slice(id.indexOf('/') + 1);
  if (/hedge/.test(name)) return green ? Surface.hedge : brown ? Surface.wood : Surface.rock;
  if (/tree|palm/.test(name)) return green ? Surface.foliage : brown || hsl.l < 0.3 ? Surface.bark : Surface.foliage;
  if (/plant_|bush|flower|grass/.test(name)) return green ? Surface.foliage : brown ? Surface.wood : Surface.foliage;
  if (/rock|cliff|stone/.test(name)) return green ? Surface.grass : Surface.rock;
  if (/bridge|dock|platform|boat|stall|bench|plank|crate|barrel|cart|log/.test(name)) return dark || hsl.s < 0.08 ? Surface.metal : Surface.wood;
  if (/lantern|lamp/.test(name)) return dark || hsl.s < 0.1 ? Surface.metal : Surface.plain;
  if (/building|roof|wall|house|tower|chimney|windmill/.test(name)) {
    if (dark) return Surface.metal;
    if (chroma < 0.16 && hsl.l > 0.35) return Surface.plaster;
    if (brown && hsl.l < 0.3) return Surface.wood;
    if (chroma >= 0.12) return Surface.roof;
    return Surface.rock;
  }
  if (/fountain|planter|statue/.test(name)) return green ? Surface.foliage : Surface.rock;
  if (id === '') {
    if (green) return Surface.grass;
    if (hsl.h < 0.06 && hsl.s > 0.3) return Surface.brick;
    if (brown) return hsl.l > 0.3 ? Surface.ground : Surface.wood;
    return Surface.rock;
  }
  return green ? Surface.foliage : Surface.plain;
}

/** Kit models whose bark and clipped leaves the colour heuristic cannot tell apart from planks and lawn: tagged at bake. */
export const TAGGED_MODELS = /tree|palm|hedge/;

/** Writes a `surface` attribute (one float per vertex) from the geometry's vertex colours. */
export function tagSurface(geometry: BufferGeometry, id: string): BufferGeometry {
  const col = geometry.getAttribute('color');
  const n = geometry.getAttribute('position').count;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = col ? surfaceOf(id, col.getX(i), col.getY(i), col.getZ(i)) : Surface.plain;
  geometry.setAttribute('surface', new BufferAttribute(out, 1));
  return geometry;
}
