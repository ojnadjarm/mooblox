import { Texture, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/get_world_demo.json';
import { toWorld } from '../../../src/domain/mapper';
import { CompletionState, CompletionTracking, type Activity } from '../../../src/domain/types';
import { IslandLayout } from '../../../src/world/island-layout';
import { MaterialKit } from '../../../src/world/material-kit';
import { DoorFactory } from '../../../src/world/props/door';
import type { PropContext } from '../../../src/world/props/prop';
import { PropRegistry } from '../../../src/world/props/prop-registry';
import { PropsLayer } from '../../../src/world/props/props-layer';

const world = toWorld(fixture);
const layout = new IslandLayout().layout(world);
const plot = layout.zones[1]!.plots[0]!;
const ctx: PropContext = { kit: new MaterialKit('low'), signs: { paint: () => new Texture() } };
const base = world.sections[1]!.activities[0]!;
const activity = (over: Partial<Activity>): Activity => ({ ...base, ...over });

describe('PropRegistry with the door fallback', () => {
  const registry = new PropRegistry(new DoorFactory());

  it('gives an unknown modname the generic door', () => {
    expect(registry.resolve(activity({ modname: 'mysterymod' })).key).toBe('door');
  });

  it('locks the door of a restricted activity and hides its flag', () => {
    const a = activity({ modname: 'mysterymod', available: false, availableInfo: 'Not available unless: page done' });
    const prop = registry.resolve(a).create(a, plot, ctx);
    expect(prop.state.locked).toBe(true);
    expect(prop.root.getObjectByName('prop-lock')!.visible).toBe(true);
    expect(prop.root.getObjectByName('prop-flag')!.visible).toBe(false);
  });

  it('stands on its plot facing the zone centre and flags completion', () => {
    const prop = registry.resolve(base).create(base, plot, ctx);
    expect(prop.root.position.x).toBe(plot.x);
    expect(prop.root.position.z).toBe(plot.z);
    expect(prop.root.rotation.y).toBe(plot.facing);
    expect(prop.state).toEqual({ locked: false, done: false });
    prop.update(activity({ completion: { ...base.completion, state: CompletionState.Complete } }));
    expect(prop.state.done).toBe(true);
    prop.update(activity({ completion: { tracking: CompletionTracking.None, state: CompletionState.Incomplete, automatic: false } }));
    expect(prop.state.done).toBeNull();
    expect(prop.root.getObjectByName('prop-flag')!.visible).toBe(false);
  });
});

describe('PropsLayer', () => {
  it('builds one prop per plot and updates them from a new world', () => {
    const props = new PropsLayer(new PropRegistry(new DoorFactory()), ctx).build(world, layout);
    expect(props.all).toHaveLength(layout.zones.flatMap((z) => z.plots).length);
    const done = toWorld({
      ...fixture,
      sections: fixture.sections.map((s) => ({ ...s, modules: s.modules.map((m) => ({ ...m, state: 1 })) })),
    });
    const wasOpen = props.all.filter((p) => p.state.done === false);
    const finished = props.update(done);
    expect(props.get(base.id)!.state.done).toBe(true);
    expect(finished.length).toBeGreaterThan(0);
    expect(finished).toEqual(wasOpen.filter((p) => p.state.done === true));
    expect(props.update(done)).toEqual([]);
  });
});

describe('door leaf', () => {
  it('swings open at the activity the player stands at, stays shut when locked, closes again', () => {
    const props = new PropsLayer(new PropRegistry(new DoorFactory()), ctx).build(world, layout);
    const open = props.all.find((p) => !p.state.locked)!;
    const leaf = (p: typeof open) => p.root.getObjectByName('prop-leaf')!.parent!;
    const body = open.root.getObjectByName('prop-body') as Mesh;
    expect(leaf(open).visible).toBe(false);
    for (let i = 0; i < 60; i++) props.swing(open.activityId, 1 / 60);
    expect(leaf(open).rotation.y).toBeGreaterThan(1.2);
    expect(leaf(open).visible).toBe(true);
    expect(body.geometry.drawRange.count).toBeLessThan(body.geometry.index!.count);
    const locked = props.all.find((p) => p.state.locked);
    if (locked) {
      for (let i = 0; i < 60; i++) props.swing(locked.activityId, 1 / 60);
      expect(leaf(locked).rotation.y).toBe(0);
    }
    for (let i = 0; i < 90; i++) props.swing(null, 1 / 60);
    expect(leaf(open).rotation.y).toBe(0);
    expect(leaf(open).visible).toBe(false);
    expect(body.geometry.drawRange.count).toBe(Infinity);
  });
});
