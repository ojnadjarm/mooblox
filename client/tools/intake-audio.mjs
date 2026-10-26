// CC0 audio intake: node tools/intake-audio.mjs <raw audio dir>  ->  public/assets/audio/*.ogg (Opus) + *.m4a (AAC) + LICENSES.csv rows
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = process.argv[2];
if (!raw) {
  console.error('usage: node tools/intake-audio.mjs <raw dir with impact-sounds/, interface-sounds/, rpg-audio/, music-jingles/, opengameart/>');
  process.exit(2);
}
const root = 'public/assets';
const out = join(root, 'audio');
const KENNEY = (pack, slug) => ({ pack, author: 'Kenney (kenney.nl)', source: `https://kenney.nl/assets/${slug}` });
const IMPACT = KENNEY('Kenney Impact Sounds 1.0', 'impact-sounds');
const UI = KENNEY('Kenney Interface Sounds 1.0', 'interface-sounds');
const RPG = KENNEY('Kenney RPG Audio 1.0', 'rpg-audio');
const JINGLES = KENNEY('Kenney Music Jingles 1.0', 'music-jingles');
const OGA = (pack, author, slug) => ({ pack, author, source: `https://opengameart.org/content/${slug}` });
const steps = (kind) => [0, 1, 2, 3, 4].map((i) => [`step-${kind === 'concrete' ? 'stone' : kind}-${i}`, `impact-sounds/Audio/footstep_${kind}_00${i}.ogg`, IMPACT]);

/** Shipped name, source file under the raw dir, origin; music is normalised to -20 LUFS (Opus stereo, the AAC fallback mono). */
const SFX = [
  ...steps('grass'),
  ...steps('concrete'),
  ...steps('wood'),
  ['jump-0', 'rpg-audio/Audio/cloth2.ogg', RPG],
  ['jump-1', 'rpg-audio/Audio/cloth3.ogg', RPG],
  ['land-0', 'impact-sounds/Audio/impactSoft_medium_000.ogg', IMPACT],
  ['land-1', 'impact-sounds/Audio/impactSoft_medium_001.ogg', IMPACT],
  ['land-2', 'impact-sounds/Audio/impactSoft_medium_002.ogg', IMPACT],
  ['open', 'interface-sounds/Audio/open_001.ogg', UI],
  ['close', 'interface-sounds/Audio/close_001.ogg', UI],
  ['xp', 'interface-sounds/Audio/confirmation_001.ogg', UI],
  ['guide', 'interface-sounds/Audio/question_003.ogg', UI],
  ['complete', 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI02.ogg', JINGLES],
  ['levelup', 'music-jingles/Audio/Steel jingles/jingles_STEEL02.ogg', JINGLES],
];
const MUSIC = [
  ['music-hub', 'opengameart/song17.mp3', OGA('Happy Lullaby (song17)', 'cynicmusic', 'happy-lullaby-song17')],
  ['music-bluebonnet', 'opengameart/bluebonnet_in_b_major_looped_0.ogg', OGA('Bluebonnet (looped)', 'Kistol', 'bluebonnet')],
  ['music-catmint', 'opengameart/catmint_in_c_major_looped.ogg', OGA('Catmint (looped)', 'Kistol', 'catmint')],
];
const MUSIC_LUFS = -20;

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
const q = (v) => `"${v}"`;

/** Integrated loudness (LUFS) of a file. */
function loudness(file) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  return Number([...run.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()[1]);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const rows = [];
const ship = (name, origin, encode) => {
  for (const ext of ['ogg', 'm4a']) {
    const file = join(out, `${name}.${ext}`);
    encode(ext, file);
    rows.push([`audio/${name}.${ext}`, origin.pack, origin.author, 'CC0-1.0', origin.source, sha(file)].map(q).join(','));
  }
};
for (const [name, src, origin] of SFX) {
  ship(name, origin, (ext, file) =>
    ffmpeg('-i', join(raw, src), '-ac', '1', '-map_metadata', '-1', ...(ext === 'ogg' ? ['-c:a', 'libopus', '-b:a', '40k'] : ['-c:a', 'aac', '-b:a', '56k', '-movflags', '+faststart']), file),
  );
}
for (const [name, src, origin] of MUSIC) {
  const gain = (MUSIC_LUFS - loudness(join(raw, src))).toFixed(1);
  ship(name, origin, (ext, file) =>
    ffmpeg('-i', join(raw, src), '-af', `volume=${gain}dB`, '-ac', ext === 'ogg' ? '2' : '1', '-map_metadata', '-1', ...(ext === 'ogg' ? ['-c:a', 'libopus', '-b:a', '30k'] : ['-c:a', 'aac', '-b:a', '36k', '-movflags', '+faststart']), file),
  );
}
const csv = join(root, 'LICENSES.csv');
const kept = readFileSync(csv, 'utf8').trim().split('\n').filter((r) => !r.startsWith('"audio/'));
writeFileSync(csv, [...kept, ...rows].join('\n') + '\n');
console.log(`${rows.length} audio files`);
