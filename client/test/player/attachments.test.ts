import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { COSMETICS } from '../../src/rewards/catalog';
import { OUTFITS, hatWearable, withOutfit } from '../../src/player/attachments';
import { OPTIONS } from '../../src/player/character/catalog';
import { DEFAULT_LOOK } from '../../src/player/character/look';
import { composeParts } from '../../src/player/character/compose';
import { toPart } from '../../src/player/hats';
import type { HatLibrary } from '../../src/player/hats';

const ids = (slot: string) => Object.keys(COSMETICS).filter((id) => COSMETICS[id]!.slot === slot);

/** The JSON chunk of a glb: node names and per-mesh index counts. */
function glb(file: string): { nodes: { name: string; mesh?: number }[]; meshes: { primitives: { indices: number }[] }[]; accessors: { count: number }[] } {
  const buf = readFileSync(file);
  const length = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + length).toString('utf8'));
}

describe('hats.glb', () => {
  const g = glb(join(__dirname, '../../public/assets/cosmetics/hats.glb'));

  it('has a designed model for each of the 12 hats, each within 400 triangles', () => {
    const names = g.nodes.map((n) => n.name);
    expect(ids('hat').filter((id) => !names.includes(id))).toEqual([]);
    for (const n of g.nodes.filter((x) => x.mesh !== undefined)) {
      const tris = g.meshes[n.mesh!]!.primitives.reduce((sum, p) => sum + g.accessors[p.indices]!.count / 3, 0);
      expect(tris, n.name).toBeLessThanOrEqual(400);
      expect(tris, n.name).toBeGreaterThanOrEqual(60);
    }
  });
});

describe('outfits', () => {
  it('dress every outfit item in allowed clothes', () => {
    expect(Object.keys(OUTFITS)).toEqual(ids('outfit'));
    for (const clothes of Object.values(OUTFITS)) {
      for (const [field, value] of Object.entries(clothes)) expect(OPTIONS[field as keyof typeof OPTIONS], field).toContain(value);
    }
  });

  it('swaps only the clothes of a look', () => {
    const dressed = withOutfit(DEFAULT_LOOK, 'outfit-lava');
    expect(dressed).toMatchObject({ ...DEFAULT_LOOK, top: 'hoodie', topc: 'red', bottomc: 'black', shoes: 'boots', shoesc: 'orange' });
    expect(withOutfit(DEFAULT_LOOK, null)).toBe(DEFAULT_LOOK);
  });
});

describe('hatWearable', () => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0.3, 0]), 3));
  const part = toPart(g);
  const library = { part: () => part } as unknown as HatLibrary;

  it('puts hats on the head top (hiding the hair crown) and glasses on the face', () => {
    expect(part.positions[7]).toBeCloseTo(3.0);
    expect(hatWearable('hat-cap', library)).toMatchObject({ slot: 'hat', hides: ['crown'] });
    expect(hatWearable('hat-glasses', library)).toMatchObject({ slot: 'face' });
    expect(hatWearable(null, library)).toBeNull();
    expect(hatWearable('hat-cap', null)).toBeNull();
  });

  it('merges the hat into the character parts', () => {
    const w = hatWearable('hat-cap', library)!;
    const parts = composeParts({ ...DEFAULT_LOOK, hair: 'spiky' }, [w]);
    expect(parts.filter((p) => p.kind === 'mesh')).toHaveLength(1);
    expect(parts.some((p) => 'tag' in p && p.tag === 'crown')).toBe(false);
  });
});
