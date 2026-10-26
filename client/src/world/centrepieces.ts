import FOOTPRINTS from './model-footprints.json';
import type { Recipe, RecipeItem } from './recipes';

/** Small seeded centrepieces for a raised lawn's top (art bible section 6): kit props only, the first item is the anchor. */

const FOOT = FOOTPRINTS as Readonly<Record<string, { w: number; h: number; r: number }>>;
const LEAF = 0xc8eaa0;
const ROCK = 0xf0e2f4;
const TREES: readonly (readonly [string, number])[] = [['nature/tree_oak', 2.3], ['nature/tree_fat', 2.2], ['nature/tree_default', 2.8], ['nature/tree_pineRoundA', 2.6], ['nature/tree_detailed', 2.1]];
const FLOWERS = ['nature/flower_redA', 'nature/flower_purpleA', 'nature/flower_redB', 'nature/flower_redC', 'nature/flower_purpleB'];

/** Flowers in a ring of `n` round the anchor, `d` metres out. */
function ring(random: () => number, n: number, d: number): RecipeItem[] {
  const base = random() * Math.PI * 2;
  return Array.from({ length: n }, (_, i) => {
    const a = base + (i / n) * Math.PI * 2;
    return { id: FLOWERS[Math.floor(random() * FLOWERS.length)]!, dx: Math.cos(a) * d, dz: Math.sin(a) * d, height: 0.3 + random() * 0.08, sway: true, detail: true };
  });
}

const VARIANTS: readonly ((random: () => number) => RecipeItem[])[] = [
  (random) => {
    const [id, h] = TREES[Math.floor(random() * TREES.length)]!;
    return [{ id, dx: 0, dz: 0, height: h * (0.9 + random() * 0.1), solid: true, sway: true, ...(id.startsWith('nature/') ? { tint: LEAF } : {}) }, ...ring(random, 4, 0.5)];
  },
  (random) => [{ id: 'suburb/planter', dx: 0, dz: 0, height: 0.42, yaw: 0, detail: true }, ...ring(random, 6, 0.52)],
  (random) => [{ id: 'nature/statue_obelisk', dx: 0, dz: 0, height: 1.7, yaw: random() * 6, solid: true, detail: true, tint: ROCK }, ...ring(random, 4, 0.5)],
  (random) => [{ id: 'town/lantern', dx: 0, dz: 0, height: 1.7, yaw: random() * 6, solid: true, detail: true, light: true }, ...ring(random, 5, 0.45)],
  () => [
    { id: 'town/stall-bench', dx: 0, dz: 0.05, height: 0.3, yaw: 0, solid: true },
    { id: 'nature/plant_bushDetailed', dx: 0.3, dz: -0.3, height: 0.42, sway: true, detail: true, tint: LEAF },
    { id: 'nature/plant_bushDetailed', dx: -0.3, dz: -0.3, height: 0.42, sway: true, detail: true, tint: LEAF },
  ],
  () => [
    { id: 'town/stall-bench', dx: 0, dz: 0.75, height: 0.4, yaw: 0, solid: true },
    { id: 'town/stall-bench', dx: 0, dz: -0.75, height: 0.4, yaw: Math.PI, solid: true },
  ],
  () => [
    { id: 'pirate/crate', dx: 0, dz: 0, height: 0.42, yaw: 0, solid: true, detail: true },
    { id: 'town/stall-stool', dx: 0.52, dz: 0, height: 0.3, yaw: 0, solid: true, detail: true },
    { id: 'town/stall-stool', dx: -0.52, dz: 0, height: 0.3, yaw: 0, solid: true, detail: true },
  ],
  () => [{ id: 'town/fountain-round-detail', dx: 0, dz: 0, height: 0.31, yaw: 0, solid: true }],
  (random) => [
    { id: 'nature/sign', dx: 0, dz: 0, height: 1, yaw: random() * 0.5 - 0.25, solid: true },
    { id: 'nature/plant_bushDetailed', dx: 0.3, dz: -0.2, height: 0.45, sway: true, detail: true, tint: LEAF },
    ...ring(random, 3, 0.5),
  ],
  (random) => [
    { id: random() < 0.5 ? 'nature/rock_tallA' : 'nature/rock_tallB', dx: 0, dz: 0, height: 0.85, solid: true, detail: true, tint: ROCK },
    { id: 'nature/rock_smallA', dx: 0.42, dz: 0.2, height: 0.22, solid: true, detail: true, tint: ROCK },
    { id: 'nature/plant_flatTall', dx: -0.3, dz: 0.35, height: 0.35, sway: true, detail: true, minor: true, tint: LEAF },
  ],
];

/** Ground reach of a recipe round its centre (item offset plus its scaled footprint radius). */
export function reachOf(items: readonly RecipeItem[]): number {
  return Math.max(...items.map((it) => Math.hypot(it.dx, it.dz) + (FOOT[it.id]!.r * it.height) / FOOT[it.id]!.h));
}

/** Every centrepiece that fits within `room` metres, in a seeded order (the designer takes the first whose anchor lands). */
export function centrepieces(random: () => number, room: number): Recipe[] {
  const order = VARIANTS.map((v, i) => ({ v, i, k: random() })).sort((a, b) => a.k - b.k);
  const out: Recipe[] = [];
  for (const { v } of order) {
    const items = v(random);
    const radius = reachOf(items);
    if (radius <= room) out.push({ items, radius });
  }
  return out;
}
