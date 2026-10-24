import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../../public/assets');
const FIRST_ZONE_BUDGET = 3 * 1024 * 1024;
const XHIGH_BUDGET = 12 * 1024 * 1024;
const xhighOnly = (f: string) => f.startsWith('kit-hd/') || f.startsWith('detail/');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [relative(root, p)];
  });
}

describe('shipped assets', () => {
  const shipped = files(root).filter((f) => f !== 'LICENSES.csv');
  const rows = readFileSync(join(root, 'LICENSES.csv'), 'utf8').trim().split('\n').slice(1);
  const licences = new Map(rows.map((r) => r.split(',').map((v) => v.replace(/^"|"$/g, ''))).map((c) => [c[0], c[3]]));

  it('every file has a CC0 row', () => {
    expect(shipped.length).toBeGreaterThan(0);
    for (const f of shipped) {
      expect(licences.get(f), f).toBe('CC0-1.0');
    }
  });

  const size = (list: string[]) => list.reduce((sum, f) => sum + statSync(join(root, f)).size, 0);

  it('fits the first-zone budget of 3 MB (xhigh-only assets aside)', () => {
    expect(size(shipped.filter((f) => !xhighOnly(f)))).toBeLessThanOrEqual(FIRST_ZONE_BUDGET);
  });

  it('keeps the xhigh-only assets (bevelled models, detail textures) within 12 MB', () => {
    const extra = shipped.filter(xhighOnly);
    expect(extra.length).toBeGreaterThan(0);
    expect(size(extra)).toBeLessThanOrEqual(XHIGH_BUDGET);
  });
});
