import { describe, expect, it } from 'vitest';
import { ATLAS_SIZE, TILES } from '../../src/player/character/atlas';
import { FIELDS, OPTIONS } from '../../src/player/character/catalog';
import { composeParts } from '../../src/player/character/compose';
import { glassesParts } from '../../src/player/character/face';
import { HAIRSTYLES } from '../../src/player/character/hair';
import { DEFAULT_LOOK, type CharacterLook } from '../../src/player/character/look';
import { buildGeometry } from '../../src/player/character/mesh';
import { BODY, BONES, triangles, type BoxPart, type Part, type Vec3 } from '../../src/player/character/parts';

type Aabb = { min: Vec3; max: Vec3 };
const EPS = 1e-6;
const overlaps = (a: Aabb, b: Aabb) => [0, 1, 2].every((i) => a.min[i]! < b.max[i]! - EPS && b.min[i]! < a.max[i]! - EPS);
const bounds = (p: Part): Aabb =>
  p.kind === 'quad'
    ? { min: [p.centre[0] - p.width / 2, p.centre[1] - p.height / 2, p.centre[2] - 0.001], max: [p.centre[0] + p.width / 2, p.centre[1] + p.height / 2, p.centre[2] + 0.001] }
    : p.kind === 'spike'
      ? { min: [Math.min(p.min[0], p.apex[0]), p.min[1], Math.min(p.min[2], p.apex[2])], max: [Math.max(p.max[0], p.apex[0]), p.apex[1], Math.max(p.max[2], p.apex[2])] }
      : { min: p.min, max: p.max };
const HEAD = BODY.head as Aabb;
const FACE: Aabb = { min: [-0.4, 1.95, 0.39], max: [0.4, 2.415, 0.5] };

/** Every value of every field, the rest default: covers each option once. */
function everyOption(): CharacterLook[] {
  return FIELDS.flatMap((f) => OPTIONS[f].map((id) => ({ ...DEFAULT_LOOK, [f]: id })));
}

describe('character parts', () => {
  it('has a hairstyle for every hair id, each a few hundred triangles at most', () => {
    for (const id of OPTIONS.hair) {
      const parts = HAIRSTYLES[id]!(0x806040);
      expect(parts.reduce((n, p) => n + triangles(p), 0), id).toBeLessThanOrEqual(1000);
    }
  });

  it('keeps every character under 1.5k triangles', () => {
    for (const look of everyOption()) {
      expect(composeParts(look).reduce((n, p) => n + triangles(p), 0)).toBeLessThanOrEqual(1500);
    }
  });

  it('no hairstyle covers the face, and big hair panels either wrap the head or stay outside it', () => {
    for (const id of OPTIONS.hair) {
      for (const p of HAIRSTYLES[id]!(0)) {
        const b = bounds(p);
        expect(overlaps(b, FACE), `${id} covers the face`).toBe(false);
        const small = [0, 1, 2].every((i) => b.max[i]! - b.min[i]! <= 0.3);
        const wraps = b.min[0] <= HEAD.min[0] && b.max[0] >= HEAD.max[0] && b.min[2] <= HEAD.min[2] && b.max[2] >= HEAD.max[2];
        if (overlaps(b, HEAD)) expect(small || wraps, `${id} panel cuts into the head`).toBe(true);
      }
    }
  });

  it('glasses never touch any hairstyle', () => {
    for (const g of OPTIONS.glasses) {
      for (const id of OPTIONS.hair) {
        for (const gp of glassesParts(g, 0)) {
          for (const hp of HAIRSTYLES[id]!(0)) expect(overlaps(bounds(gp), bounds(hp)), `${g} glasses vs ${id}`).toBe(false);
        }
      }
    }
  });

  it('hair stays clear of the torso and arms', () => {
    const body = [BODY.torso, BODY.armLeft, BODY.armRight] as Aabb[];
    for (const id of OPTIONS.hair) {
      for (const p of HAIRSTYLES[id]!(0)) for (const b of body) expect(overlaps(bounds(p), b), id).toBe(false);
    }
  });

  it('a hat wearable hides the crown hair and replaces nothing else', () => {
    const hat = { id: 'cap', slot: 'hat' as const, hides: ['crown'] as const, parts: (): Part[] => [] };
    const look = { ...DEFAULT_LOOK, hair: 'spiky' };
    const all = composeParts(look);
    const hatted = composeParts(look, [hat]);
    expect(hatted.some((p) => p.kind !== 'quad' && p.tag === 'crown')).toBe(false);
    expect(all.length - hatted.length).toBe(all.filter((p) => p.kind !== 'quad' && p.tag === 'crown').length);
  });

  it('builds one merged skinned geometry with every vertex on a rig bone', () => {
    const g = buildGeometry(composeParts({ ...DEFAULT_LOOK, hair: 'curly', glasses: 'round' }));
    const skin = g.getAttribute('skinIndex');
    for (let i = 0; i < skin.count; i++) expect(skin.getX(i)).toBeLessThan(BONES.length);
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    expect(g.index!.count % 3).toBe(0);
    const pos = g.getAttribute('position');
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
    expect(minY).toBeCloseTo(0, 5);
  });

  it('box faces wind counter-clockwise outward', () => {
    const box: BoxPart = { kind: 'box', bone: 'root', min: [0, 0, 0], max: [1, 1, 1], colour: 0 };
    const g = buildGeometry([box]);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const idx = g.index!;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const e1 = [p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a)];
      const e2 = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)];
      const cross = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      expect(cross[0]! * n.getX(a) + cross[1]! * n.getY(a) + cross[2]! * n.getZ(a)).toBeGreaterThan(0);
    }
  });

  it('has an atlas tile for every face option, inside the atlas, none overlapping', () => {
    for (const s of OPTIONS.eyes) expect(TILES[`eye-${s}`] && TILES[`hl-${s}`]).toBeTruthy();
    for (const s of OPTIONS.brows) expect(TILES[`brow-${s}`]).toBeTruthy();
    for (const s of OPTIONS.mouth) expect(TILES[`mouth-${s}`]).toBeTruthy();
    for (const s of OPTIONS.glasses.filter((x) => x !== 'none')) expect(TILES[`glasses-${s}`]).toBeTruthy();
    const rects = Object.values(TILES);
    for (const [x, y, w, h] of rects) expect(x >= 0 && y >= 0 && x + w <= ATLAS_SIZE && y + h <= ATLAS_SIZE).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [a, b] = [rects[i]!, rects[j]!];
        expect(a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]).toBe(false);
      }
    }
  });
});
