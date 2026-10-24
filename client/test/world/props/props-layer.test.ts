import { Group, Object3D, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { PropsLayer } from '../../../src/world/props/props-layer';
import type { Prop, PropContext } from '../../../src/world/props/prop';
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

  it('wants a sign from 15 m before it shows and releases it past twice that', () => {
    const wanted: number[] = [];
    const released: number[] = [];
    const textures = [new Texture(), new Texture(), new Texture()];
    const signs = { paint: () => new Texture(), want: (t: Texture) => wanted.push(textures.indexOf(t)), release: (t: Texture) => released.push(textures.indexOf(t)), forget: () => undefined };
    const prop = (id: number): Prop => ({ activityId: id, key: 'k', root: new Group(), detail: new Group(), sign: textures[id]!, state: { locked: false, done: null }, update() {}, dispose() {} });
    const registry = { resolve: () => ({ create: (a: { id: number }, plot: { x: number; z: number }) => {
      const p = prop(a.id);
      p.root.position.set(plot.x, 0, plot.z);
      return p;
    } }) } as unknown as PropRegistry;
    const layer = new PropsLayer(registry, { kit: null, signs } as unknown as PropContext);
    const plots = [0, 40, 70].map((x, id) => ({ x, z: 0, activityId: id }));
    const world = { sections: [{ activities: plots.map((p) => ({ id: p.activityId })) }] };
    layer.build(world as never, { zones: [{ plots }] } as never);
    layer.cull(0, 0, 30, 70, 0);
    expect(wanted).toEqual([0, 1]);
    expect(released).toEqual([2]);
  });
});
