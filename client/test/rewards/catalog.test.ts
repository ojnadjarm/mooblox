import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COSMETICS, type Slot } from '../../src/rewards/catalog';

const assets = join(__dirname, '../../public/assets');
const php = readFileSync(join(__dirname, '../../../moodle/local/mooblox/classes/rewards/catalog.php'), 'utf8');
const rows = readFileSync(join(assets, 'LICENSES.csv'), 'utf8').trim().split('\n').slice(1);
const licences = new Map(rows.map((r) => r.split(',').map((v) => v.replace(/^"|"$/g, ''))).map((c) => [c[0], c[3]]));

function phpIds(constant: string): string[] {
  const body = php.match(new RegExp(`const ${constant} = \\[([^\\]]*)\\]`))?.[1] ?? '';
  return [...body.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1] ?? '');
}

const clientIds = (slot: Slot) => Object.keys(COSMETICS).filter((id) => COSMETICS[id]?.slot === slot);

describe('cosmetics catalog', () => {
  it.each([
    ['HATS', 'hat', 12],
    ['OUTFITS', 'outfit', 9],
    ['PETS', 'pet', 6],
    ['TROPHIES', 'trophy', 3],
  ] as const)('PHP %s matches the client %s ids (%i)', (constant, slot, count) => {
    expect(phpIds(constant)).toEqual(clientIds(slot));
    expect(clientIds(slot)).toHaveLength(count);
  });

  it('gives each of the 30 ids a licence row; shipped art is CC0 and exists', () => {
    expect(Object.keys(COSMETICS)).toHaveLength(30);
    for (const [id, item] of Object.entries(COSMETICS)) {
      expect(licences.has(item.licence), id).toBe(true);
      const file = item.art.includes('#') ? item.art.split('#')[0] : null;
      if (file) {
        expect(existsSync(join(assets, file)), id).toBe(true);
        expect(licences.get(file), id).toBe('CC0-1.0');
      }
      if (item.art.startsWith('palette:')) {
        expect(licences.get(item.licence), id).toBe('CC0-1.0');
      }
    }
  });
});
