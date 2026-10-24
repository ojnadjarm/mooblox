import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { PropsLayer } from '../../../src/world/props/props-layer';
import type { PropContext } from '../../../src/world/props/prop';
import type { PropRegistry } from '../../../src/world/props/prop-registry';

describe('PropsLayer', () => {
  it('updates the matrices of shown props only, and keeps every prop in the group', () => {
    const layer = new PropsLayer(null as unknown as PropRegistry, null as unknown as PropContext);
    const shown = new Object3D();
    const hidden = new Object3D();
    hidden.visible = false;
    shown.position.x = 3;
    hidden.position.x = 5;
    layer.group.add(shown, hidden);
    layer.group.updateMatrixWorld();
    expect(shown.matrixWorld.elements[12]).toBe(3);
    expect(hidden.matrixWorld.elements[12]).toBe(0);
    expect(layer.group.children).toEqual([shown, hidden]);
  });
});
