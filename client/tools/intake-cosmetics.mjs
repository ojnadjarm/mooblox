// CC0 cosmetics intake: node tools/intake-cosmetics.mjs <raw dir>  ->  public/assets/cosmetics/*.glb + LICENSES.csv rows
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raw = process.argv[2];
if (!raw) {
  console.error('usage: node tools/intake-cosmetics.mjs <raw dir with kenney-cube-pets/>');
  process.exit(2);
}
const root = 'public/assets';
const cli = join('node_modules', '.bin', 'gltf-transform');
const PACKS = [
  {
    out: 'cosmetics/pets.glb',
    pack: 'Kenney Cube Pets 2.0',
    source: 'https://kenney.nl/assets/cube-pets',
    dir: 'kenney-cube-pets/Models/GLB format',
    files: ['animal-cat', 'animal-dog', 'animal-bunny', 'animal-fox', 'animal-panda', 'animal-penguin'],
  },
];

const run = (...args) => execFileSync(cli, args, { stdio: ['ignore', 'ignore', 'inherit'] });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
const q = (v) => `"${v}"`;
mkdirSync(join(root, 'cosmetics'), { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'mooblox-cosmetics-'));
const rows = [];
try {
  for (const p of PACKS) {
    const merged = join(tmp, 'merged.glb');
    run('merge', ...p.files.map((f) => join(raw, p.dir, `${f}.glb`)), merged, '--merge-scenes');
    run('dedup', merged, merged);
    run('prune', merged, merged);
    run('meshopt', merged, join(root, p.out));
    rows.push([p.out, p.pack, 'Kenney (kenney.nl)', 'CC0-1.0', p.source, sha(join(root, p.out))].map(q).join(','));
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const csv = join(root, 'LICENSES.csv');
const kept = readFileSync(csv, 'utf8').trim().split('\n').filter((r) => !r.startsWith('"cosmetics/'));
writeFileSync(csv, [...kept, ...rows].join('\n') + '\n');
console.log(rows.join('\n'));
