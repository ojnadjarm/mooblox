import { describe, expect, it } from 'vitest';
import FOOTPRINTS from '../../src/world/model-footprints.json';
import { seededRandom } from '../../src/world/random';
import { recipe, WAYSIDE, type RecipeKind } from '../../src/world/recipes';

const KINDS: readonly RecipeKind[] = ['treeClump', 'gardenBed', 'rockGroup', 'readingNook', ...WAYSIDE];

describe('set-dressing recipes', () => {
  for (const kind of KINDS) {
    it(`${kind}: kit models only, every item inside its radius, same seed same cluster`, () => {
      for (let seed = 1; seed < 40; seed++) {
        const r = recipe(kind, seededRandom(seed));
        expect(r).toEqual(recipe(kind, seededRandom(seed)));
        for (const it of r.items) {
          expect(FOOTPRINTS).toHaveProperty([it.id]);
          expect(Math.hypot(it.dx, it.dz)).toBeLessThanOrEqual(r.radius);
          expect(it.height).toBeGreaterThan(0);
        }
      }
    });
  }

  it('tree clumps hold 3 to 5 trees, one clearly bigger than the rest', () => {
    for (let seed = 1; seed < 40; seed++) {
      const trees = recipe('treeClump', seededRandom(seed)).items.filter((i) => i.solid);
      expect(trees.length).toBeGreaterThanOrEqual(3);
      expect(trees.length).toBeLessThanOrEqual(5);
      expect(Math.max(...trees.slice(1).map((t) => t.height))).toBeLessThan(trees[0]!.height);
    }
  });
});
