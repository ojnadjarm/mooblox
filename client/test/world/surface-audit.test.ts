import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { familyOf } from '../../src/world/kit-materials';
import { CAMPUS } from '../../src/world/look';
import { auditMesh, auditPlacement, modelMesh, placementVariants, triangleFamilies, type AuditPart } from '../../src/world/surface-audit';
import { Surface } from '../../src/world/surfaces';
import { bakeKit } from '../../tools/kit-bake';

const kit = await bakeKit(new URL('../../public/assets/kit.glb', import.meta.url).pathname);
const lib = { get: (id: string) => kit.get(id)!.model };
const families = new Map([...kit].map(([id, k]) => [id, triangleFamilies(id, k.model, k.materials)]));
const wrong = (id: string, parts: readonly AuditPart[]) =>
  parts.filter((p) => !p.ok).map((p) => `${id} ${p.material} ${p.colour} ${p.family ?? 'no kind'} drawn ${p.layer} x${p.tris}`);

describe('kit surface audit: every part draws with an atlas layer of its material family', () => {
  it('reads warm bench planks as wood, red awnings as cloth, iron hoops iron, window glass smooth', () => {
    expect(familyOf('town/stall-bench', 'colormap', 0.6, 0.25, 0.13)).toBe('wood');
    expect(familyOf('town/stall-red', 'colormap', 0.7, 0.08, 0.1)).toBe('cloth');
    expect(familyOf('pirate/barrel', 'colormap', 0.33, 0.36, 0.52)).toBe('iron');
    expect(familyOf('suburb/building-type-a', 'colormap', 0.33, 0.55, 0.85)).toBe('smooth');
    expect(familyOf('suburb/building-type-a', 'colormap-cream', 0.9, 0.85, 0.7)).toBe('plaster');
    expect(familyOf('nature/tree_oak', 'woodBark', 0.89, 0.51, 0.34)).toBe('bark');
    expect(familyOf('nature/unknown_thing', 'wood', 1, 1, 1)).toBeNull();
  });

  it('flags a warm plank the colour heuristic draws as brick', () => {
    const plank = { color: [0.6, 0.25, 0.13, 0.6, 0.25, 0.13, 0.6, 0.25, 0.13], normal: [0, 0, 1, 0, 0, 1, 0, 0, 1], index: null };
    const fam = [{ family: 'wood' as const, material: 'colormap' }];
    expect(auditMesh(fam, { ...plank, surface: null })).toMatchObject([{ layer: Surface.brick, ok: false }]);
    expect(auditMesh(fam, { ...plank, surface: [Surface.wood, Surface.wood, Surface.wood] })).toMatchObject([{ layer: Surface.wood, ok: true }]);
  });

  it('has no collapsed kit model (a runaway vertex once flattened house E to a 98 km line)', () => {
    expect([...kit].filter(([, k]) => !(k.model.width > 0.05 && k.model.height < 20 * k.model.width)).map(([id]) => id)).toEqual([]);
  });

  it('as the kit ships every model', () => {
    expect([...kit].flatMap(([id, k]) => wrong(id, auditMesh(families.get(id)!, modelMesh(k.model))))).toEqual([]);
  });

  const policy = new IslandLayout(CAMPUS.size);
  for (const [name, w] of [['demo', toWorld(fixture)], ['8x12', shapeWorld(812, parseShape('8x12'))], ['20x30', shapeWorld(2030, parseShape('20x30'))]] as const) {
    it(`placed on the ${name} course, every tier`, () => {
      const placements = designWorld(policy.layout(w), w.courseId, CAMPUS.palette).districts.flatMap((d) => d.placements);
      const out: string[] = [];
      for (const p of placementVariants(placements)) {
        for (const rich of [false, true]) out.push(...wrong(p.id, auditPlacement(p, lib, families.get(p.id)!, rich)));
      }
      expect(out).toEqual([]);
    }, 30000);
  }
});
