/**
 * Set-dressing recipes (art bible section 6): small curated clusters stamped as units instead of uniform scatter.
 * Pure art data; the designer decides where a recipe fits and places its items.
 */

/** One item of a cluster, in the cluster's local frame (metres; +z = the cluster's front). */
export interface RecipeItem {
  readonly id: string;
  readonly dx: number;
  readonly dz: number;
  readonly height: number;
  /** Yaw relative to the cluster's facing; omitted = random. */
  readonly yaw?: number;
  readonly solid?: boolean;
  readonly sway?: boolean;
  readonly detail?: boolean;
  readonly minor?: boolean;
  readonly tint?: number;
  /** A lamp: gets a glowing lantern pane. */
  readonly light?: boolean;
}

/** A cluster: its items, its ground reach and an optional grounding patch (a darker lawn disc under it). */
export interface Recipe {
  readonly items: readonly RecipeItem[];
  readonly radius: number;
  readonly patch?: { readonly r: number; readonly colour: number };
}

export type RecipeKind = 'treeClump' | 'gardenBed' | 'rockGroup' | 'readingNook';

const LEAF = 0xc8eaa0;
const ROCK = 0xf0e2f4;
const CLUMP_TREES = ['nature/tree_detailed', 'nature/tree_oak', 'nature/tree_default', 'nature/tree_fat', 'nature/tree_pineRoundA', 'suburb/tree-large'];
const BEDS: readonly (readonly [string, string])[] = [['nature/flower_redA', 'nature/flower_yellowA'], ['nature/flower_purpleA', 'nature/flower_yellowB'], ['nature/flower_redB', 'nature/flower_purpleB'], ['nature/flower_redC', 'nature/flower_yellowA']];

/** Builds one recipe; `random` gives the variation (sizes, picks, angles) so the same seed gives the same cluster. */
export function recipe(kind: RecipeKind, random: () => number): Recipe {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  if (kind === 'treeClump') {
    const n = 3 + Math.floor(random() * 3);
    const items: RecipeItem[] = [];
    const base = random() * Math.PI * 2;
    const top = 5 + random() * 0.8;
    // One big tree, the others clearly smaller round it: scale contrast inside every clump.
    for (let i = 0; i < n; i++) {
      const id = pick(CLUMP_TREES);
      const a = base + (i / n) * Math.PI * 2 + random() * 0.6;
      const r = i === 0 ? 0 : 1.4 + random() * 0.6;
      const height = i === 0 ? top : top * (0.5 + random() * 0.3);
      items.push({ id, dx: Math.cos(a) * r, dz: Math.sin(a) * r, height, solid: true, sway: true, ...(id.startsWith('nature/') ? { tint: LEAF } : {}) });
    }
    for (let i = 0; i < 3; i++) {
      const a = base + 0.5 + i * 2.1;
      items.push({ id: pick(['nature/plant_bushDetailed', 'nature/plant_bushLarge']), dx: Math.cos(a) * 2.3, dz: Math.sin(a) * 2.3, height: 0.8 + random() * 0.4, sway: true, detail: true, tint: LEAF });
    }
    for (let i = 0; i < 3; i++) {
      const a = random() * Math.PI * 2;
      items.push({ id: pick(['nature/grass_large', 'nature/grass_leafs', 'nature/plant_bushSmall']), dx: Math.cos(a) * 2.7, dz: Math.sin(a) * 2.7, height: 0.4, sway: true, detail: true, minor: true, tint: LEAF });
    }
    return { items, radius: 2.9, patch: { r: 2.6, colour: 0x7fb85a } };
  }
  if (kind === 'gardenBed') {
    const [a, b] = pick(BEDS);
    const items: RecipeItem[] = [{ id: 'suburb/planter', dx: 0, dz: 0, height: 0.7, yaw: 0, detail: true }];
    for (let i = 0; i < 6; i++) {
      const x = -1.5 + (i % 3) * 1.5;
      const z = i < 3 ? -1.1 : 1.1;
      items.push({ id: (i + (i < 3 ? 0 : 1)) % 2 ? a : b, dx: x, dz: z, height: 0.5 + random() * 0.15, sway: true, detail: true, ...(i % 2 ? { minor: true } : {}) });
    }
    items.push({ id: 'nature/plant_bushLarge', dx: 2.6, dz: 0, height: 0.9, sway: true, detail: true, tint: LEAF });
    return { items, radius: 2.8, patch: { r: 2.6, colour: 0x8fc45a } };
  }
  if (kind === 'rockGroup') {
    return {
      items: [
        { id: pick(['nature/rock_tallA', 'nature/rock_tallB', 'nature/rock_largeB']), dx: 0, dz: 0, height: 1.3 + random() * 0.6, detail: true, tint: ROCK },
        { id: pick(['nature/rock_largeA', 'nature/rock_largeC']), dx: 1.2, dz: 0.5, height: 0.6 + random() * 0.3, detail: true, tint: ROCK },
        { id: 'nature/rock_smallA', dx: -0.9, dz: 0.9, height: 0.35, detail: true, tint: ROCK },
        { id: 'nature/grass_leafsLarge', dx: 0.4, dz: -1, height: 0.5, sway: true, detail: true, minor: true, tint: LEAF },
      ],
      radius: 1.9,
    };
  }
  return {
    items: [
      { id: 'town/stall-bench', dx: 0, dz: 0, height: 0.55, yaw: 0, solid: true },
      { id: 'town/lantern', dx: 1.6, dz: -0.2, height: 2.6, yaw: 0, solid: true, detail: true, light: true },
      { id: 'suburb/planter', dx: -1.7, dz: -0.1, height: 0.7, yaw: 0, detail: true },
      { id: 'nature/plant_bushDetailed', dx: -0.6, dz: -1.3, height: 1, sway: true, detail: true, tint: LEAF },
      { id: 'nature/plant_bushLarge', dx: 0.7, dz: -1.4, height: 0.9, sway: true, detail: true, tint: LEAF },
    ],
    radius: 2.4,
  };
}
