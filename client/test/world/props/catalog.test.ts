import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/get_world_demo.json';
import { toWorld } from '../../../src/domain/mapper';
import { createPropRegistry } from '../../../src/world/props/catalog';

const activities = toWorld(fixture).sections.flatMap((s) => s.activities);

describe('createPropRegistry', () => {
  it('resolves each demo modname to its prop', () => {
    const registry = createPropRegistry();
    const keys = Object.fromEntries(activities.map((a) => [`${a.modname}-${a.id}`, registry.resolve(a).key]));
    expect(keys).toEqual({
      'label-40': 'signpost',
      'page-41': 'book-stand',
      'resource-42': 'cinema',
      'url-43': 'cinema',
      'quiz-44': 'arena-gate',
    });
    const pdf = { ...activities[2]!, media: { type: 'file' as const, mimetype: 'application/pdf', src: 'x.pdf' } };
    expect(registry.resolve(pdf).key).toBe('door');
    expect(registry.resolve({ ...activities[1]!, modname: 'assign' }).key).toBe('door');
  });
});
