import { BufferAttribute, Color, type BufferGeometry } from 'three';

/** Material class of a vertex: the layer of the painted surface atlas it shows (`world/surface-atlas.ts`). */
export const Surface = {
  plain: 0, grass: 1, foliage: 2, wood: 3, rock: 4, roof: 5, plaster: 6, brick: 7, ground: 8, metal: 9,
  sand: 10, paving: 11, meadow: 12, cliff: 13, bark: 14, hedge: 15, floor: 16, cloth: 17,
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
  { metres: 3, strength: 0.8 },
  { metres: 2, strength: 0.7 },
  { metres: 2.4, strength: 0.75 },
  { metres: 2.6, strength: 0.7 },
  { metres: 1.2, strength: 0.85 },
  { metres: 1.3, strength: 0.75 },
  { metres: 2.4, strength: 0.9 },
  { metres: 1.2, strength: 0.6 },
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
    if ((chroma < 0.16 && hsl.l > 0.35) || (hsl.l > 0.6 && hsl.s < 0.5)) return Surface.plaster;
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

/** Layer the shader picks for an untagged vertex from its linear colour and object-normal y (TS twin of `atlasLayer` in material-kit.ts). */
export function colourLayer(r: number, g: number, b: number, ny: number): SurfaceId {
  const [cr, cg, cb] = [Math.sqrt(Math.max(r, 0)), Math.sqrt(Math.max(g, 0)), Math.sqrt(Math.max(b, 0))];
  const mx = Math.max(cr, cg, cb);
  const mn = Math.min(cr, cg, cb);
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  const up = ny > 0.7;
  if (mx < 0.2) return Surface.metal;
  if (cg > cr * 1.05 && cg > cb) return ny > 0.25 && ny < 0.92 && cb > cg * 0.7 ? Surface.roof : up ? Surface.grass : Surface.foliage;
  if (cb >= cr * 0.9 && sat < 0.35) return mx < 0.85 ? Surface.rock : Surface.metal;
  if (ny > 0.25 && ny < 0.92 && sat > 0.3) return Surface.roof;
  if (cb >= cr) return sat < 0.2 && mx < 0.85 ? Surface.rock : Surface.metal;
  if (sat < 0.22) return mx > 0.8 ? (up ? Surface.paving : Surface.plaster) : Surface.rock;
  if (mx > 0.8 && sat < 0.45) return up ? Surface.sand : Surface.plaster;
  const hue = (cg - cb) / Math.max(mx - mn, 1e-3) / 6;
  if (hue < 0.075 && sat > 0.45 && mx > 0.75) return Surface.brick;
  return Surface.wood;
}

/** The atlas layer a vertex draws with: its `surface` tag (grain flag dropped) or else `colourLayer`; brick facing up is floor. */
export function drawnLayer(surface: number, r: number, g: number, b: number, ny: number): SurfaceId {
  const s = surface > GRAIN - 0.5 ? surface - GRAIN : surface;
  const layer = s > 0.5 ? (Math.round(s) as SurfaceId) : colourLayer(r, g, b, ny);
  return layer === Surface.brick && ny > 0.7 ? Surface.floor : layer;
}

/** The model axis its deck planks run along (bridge boards cross it on x, dock and bench planks run its length on z); null = no grain tag. */
export function grainAxis(id: string): 'x' | 'z' | null {
  return /bridge/.test(id) ? 'x' : /platform-dock|stall-bench/.test(id) ? 'z' : null;
}

/** Added to a surface id: the atlas runs along the grain axis carried in the vertex normal's tilt (`grainTops`). */
export const GRAIN = 32;

/** Tilt of a flat top's normal toward its grain axis: small enough to leave the shading alone, it turns with the placement's yaw. */
export const GRAIN_TILT = 0.02;

/** Marks the flat upward faces of a tagged geometry: normal tilted toward the grain axis, surface id + `GRAIN`. */
export function grainTops(geometry: BufferGeometry, axis: 'x' | 'z'): BufferGeometry {
  const nrm = geometry.getAttribute('normal');
  const srf = geometry.getAttribute('surface');
  const up = Math.sqrt(1 - GRAIN_TILT * GRAIN_TILT);
  for (let i = 0; i < nrm.count; i++) {
    if (nrm.getY(i) < 0.999) continue;
    nrm.setXYZ(i, axis === 'x' ? GRAIN_TILT : 0, up, axis === 'z' ? GRAIN_TILT : 0);
    srf.setX(i, srf.getX(i) + GRAIN);
  }
  return geometry;
}

/** Writes a `surface` attribute (one float per vertex) from the geometry's vertex colours. */
export function tagSurface(geometry: BufferGeometry, id: string): BufferGeometry {
  const col = geometry.getAttribute('color');
  const n = geometry.getAttribute('position').count;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = col ? surfaceOf(id, col.getX(i), col.getY(i), col.getZ(i)) : Surface.plain;
  geometry.setAttribute('surface', new BufferAttribute(out, 1));
  return geometry;
}
