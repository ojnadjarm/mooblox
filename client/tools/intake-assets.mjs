// CC0 asset intake: node tools/intake-assets.mjs <raw dir>  ->  public/assets/*.glb|png + LICENSES.csv
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const raw = process.argv[2];
if (!raw) {
  console.error('usage: node tools/intake-assets.mjs <raw dir with kenney-blocky/, prototype-bits/, city-builder-bits/>');
  process.exit(2);
}
const out = 'public/assets';
const cli = join('node_modules', '.bin', 'gltf-transform');
const CC0 = 'CC0-1.0';
const PACKS = [
  {
    out: 'kenney-blocky.glb',
    pack: 'Kenney Blocky Characters 2.0',
    author: 'Kenney (kenney.nl)',
    source: 'https://kenney.nl/assets/blocky-characters',
    files: ['kenney-blocky/Models/GLB format/character-a.glb'],
    skins: 'kenney-blocky/Models/GLB format/Textures',
  },
  {
    out: 'kaykit-prototype.glb',
    pack: 'KayKit Prototype Bits 1.1',
    author: 'Kay Lousberg (kaylousberg.com)',
    source: 'https://kaylousberg.itch.io/prototype-bits',
    dir: 'prototype-bits/KayKit_Prototype_Bits_1.1_FREE/Assets/gltf',
    files: ['Door_A', 'Door_A_Decorated', 'Door_B', 'Primitive_Doorway', 'Barrel_A', 'Box_A', 'Coin_A', 'Pillar_A', 'Dummy_Base'],
  },
  {
    out: 'kaykit-city.glb',
    pack: 'KayKit City Builder Bits 1.0',
    author: 'Kay Lousberg (kaylousberg.com)',
    source: 'https://kaylousberg.itch.io/city-builder-bits',
    dir: 'city-builder-bits/KayKit_City_Builder_Bits_1.0_FREE/Assets/gltf',
    files: ['bench', 'streetlight', 'bush', 'trash_A', 'firehydrant', 'watertower'],
  },
];

const run = (...args) => execFileSync(cli, args, { stdio: ['ignore', 'ignore', 'inherit'] });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const rows = [];
const tmp = mkdtempSync(join(tmpdir(), 'mooblox-assets-'));
try {
  for (const p of PACKS) {
    const inputs = p.files.map((f) => join(raw, p.dir ?? '', p.dir ? `${f}.gltf` : f));
    const merged = join(tmp, 'merged.glb');
    if (inputs.length > 1) {
      run('merge', ...inputs, merged, '--merge-scenes');
      run('dedup', merged, merged);
    } else {
      run('dedup', inputs[0], merged);
    }
    run('prune', merged, merged, '--keep-attributes', 'true');
    run('meshopt', merged, join(out, p.out));
    rows.push([p.out, p.pack, p.author, CC0, p.source, sha(join(out, p.out))]);
    if (p.skins) {
      mkdirSync(join(out, 'skins'), { recursive: true });
      for (const png of readdirSync(join(raw, p.skins)).filter((f) => f.endsWith('.png')).sort()) {
        const dest = join('skins', basename(png));
        copyFileSync(join(raw, p.skins, png), join(out, dest));
        rows.push([dest, p.pack, p.author, CC0, p.source, sha(join(out, dest))]);
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const csv = ['file,pack,author,license,source,sha256_16', ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
writeFileSync(join(out, 'LICENSES.csv'), `${csv}\n`);
console.log(`${rows.length} files, LICENSES.csv written`);
