import { describe, expect, it } from 'vitest';
import { Box3, type BufferAttribute } from 'three';
import { HUB } from '../../src/hub/hub-layout';
import { logoSignParts, type LogoSignDesign } from '../../src/hub/logo-sign';
import { CAMPUS } from '../../src/world/look';

describe('hub logo sign', () => {
  it.each<LogoSignDesign>(['gateway', 'board'])('%s: feet outside the balustrade on the island, letters above the course signs', (design) => {
    const boxes = logoSignParts(CAMPUS.palette, design).map((g) => new Box3().setFromBufferAttribute(g.getAttribute('position') as BufferAttribute));
    const feet = boxes.filter((b) => b.min.y < 1);
    expect(feet.length).toBe(4);
    for (const b of feet) expect([b.max.z < -HUB.wall, b.min.z > -HUB.radius]).toEqual([true, true]);
    expect(boxes.filter((b) => b.min.y > 9).length).toBeGreaterThan(7);
  });
});
