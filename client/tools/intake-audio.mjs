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
const NATURE = {
  bark: OGA('Dog barking mono', 'Brandon Morris (HaelDB)', 'dog-barking-mono'),
  gull: OGA('Solo Seagull Sound Effects', 'Rango Mango', 'solo-seagull-sound-effects'),
  meow: OGA('Meow', 'IgnasD', 'meow'),
  softmew: OGA('Cat purr & meow', 'Kerzoven', 'cat-purr-meow'),
  kitten: OGA('Kitten mew', 'AntumDeluge', 'kitten-mew'),
  wave: OGA('Water waves', 'transitking', 'water-waves'),
  shore: OGA('Sea and river wave sounds', 'RandomMind', 'sea-and-river-wave-sounds'),
  birds: OGA('Ambient bird sounds', 'isaiah658', 'ambient-bird-sounds'),
};
const MOOBLOX = { pack: 'MOOBLOX synthesised duck quack (tools/intake-audio.mjs)', author: 'MOOBLOX contributors', source: 'https://github.com/ojnadjarm/mooblox' };
/** A duck quack made from a gliding buzz through a nasal band: start and end pitch (Hz), length (s). */
const quack = (f0, f1, len) =>
  `aevalsrc='0.8*(2*mod(${f0}*t+(${f1}-${f0})*t*t/(2*${len}),1)-1)*sin(PI*min(t/${len},1))^0.6':s=44100:d=${len},bandpass=f=1250:w=1100,equalizer=f=2600:t=q:w=2:g=6,lowpass=f=5000`;
const BARKS = [[0, 0.26], [0.5, 0.74], [1.1, 1.38], [1.67, 2.04]];
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
  ['gem-0', 'interface-sounds/Audio/glass_001.ogg', UI],
  ['gem-1', 'interface-sounds/Audio/glass_002.ogg', UI],
  ['gem-2', 'interface-sounds/Audio/glass_003.ogg', UI],
  ['crystal-0', 'interface-sounds/Audio/glass_005.ogg', UI],
  ['crystal-1', 'interface-sounds/Audio/glass_006.ogg', UI],
  ['star', 'interface-sounds/Audio/maximize_006.ogg', UI],
  ['click-0', 'interface-sounds/Audio/click_002.ogg', UI],
  ['click-1', 'interface-sounds/Audio/click_003.ogg', UI],
  ['prompt', 'interface-sounds/Audio/select_002.ogg', UI],
  ['emote-0', 'interface-sounds/Audio/pluck_001.ogg', UI],
  ['emote-1', 'interface-sounds/Audio/pluck_002.ogg', UI],
  ['bump-0', 'impact-sounds/Audio/impactSoft_heavy_000.ogg', IMPACT],
  ['bump-1', 'impact-sounds/Audio/impactSoft_heavy_001.ogg', IMPACT],
  ['book', 'rpg-audio/Audio/bookOpen.ogg', RPG],
  ['page-0', 'rpg-audio/Audio/bookFlip1.ogg', RPG],
  ['page-1', 'rpg-audio/Audio/bookFlip2.ogg', RPG],
  ['equip-0', 'rpg-audio/Audio/cloth1.ogg', RPG],
  ['equip-1', 'rpg-audio/Audio/cloth4.ogg', RPG],
  ['goal', 'music-jingles/Audio/Steel jingles/jingles_STEEL00.ogg', JINGLES],
  ...BARKS.map(([a, b], i) => [`bark-${i}`, 'oga-nature/dog_barking_mono.wav', NATURE.bark, `atrim=${a}:${b},asetpts=N/SR/TB,afade=t=out:st=${(b - a - 0.04).toFixed(2)}:d=0.04`]),
  ['bark-4', 'oga-nature/dog_barking_mono.wav', NATURE.bark, 'atrim=0.5:1.38,asetpts=N/SR/TB,afade=t=out:st=0.84:d=0.04'],
  ['gull-0', 'oga-nature/seagull-hit-1.wav', NATURE.gull],
  ['gull-1', 'oga-nature/seagull-ambient-1.wav', NATURE.gull, 'afade=t=out:st=3.5:d=0.39'],
  ['meow-0', 'oga-nature/Meow.ogg', NATURE.meow],
  ['meow-1', 'oga-nature/cat_softmew.wav', NATURE.softmew, 'atrim=0.3:2.2,asetpts=N/SR/TB'],
  ['meow-2', 'oga-nature/kitten_mew-1_0.ogg', NATURE.kitten],
  ['wave-0', 'oga-nature/wave_01_cc0-11505__transitking__wavesound.flac', NATURE.wave],
  ['wave-1', 'oga-nature/wave_02_cc0-11505__transitking__wavesound.flac', NATURE.wave],
  ['quack-0', null, MOOBLOX, quack(560, 430, 0.16)],
  ['quack-1', null, MOOBLOX, quack(610, 470, 0.13)],
  ['quack-2', null, MOOBLOX, quack(520, 400, 0.19)],
];
/** Nature sounds come at any level: peaks are set to -1 dBFS like the Kenney files. */
const PEAK = -1;
/** Ambient beds: a stretch of the recording looped seamlessly (its first 2 s crossfaded over its end), -20 LUFS. */
const BEDS = [
  ['bed-shore', 'oga-nature/VistulaShort_0.mp3', NATURE.shore, 40, 22],
  ['bed-birds', 'oga-nature/birds-isaiah658_0.ogg', NATURE.birds, 0, 30.6],
];
const XFADE = 2;
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
/** Peak level (dBFS) of an input with a filter. */
function peak(input, filter) {
  const run = spawnSync('ffmpeg', ['-hide_banner', ...input, '-af', `${filter ? `${filter},` : ''}volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
  return Number(run.stderr.match(/max_volume: (-?[\d.]+) dB/)[1]);
}
for (const [name, src, origin, filter] of SFX) {
  const input = src ? ['-i', join(raw, src)] : ['-f', 'lavfi', '-i', filter];
  const af = src ? filter : 'anull';
  const level = src && !src.startsWith('oga-nature/') ? '' : `volume=${(PEAK - peak(input, af)).toFixed(1)}dB`;
  const chain = [af, level].filter(Boolean).join(',');
  ship(name, origin, (ext, file) =>
    ffmpeg(...input, ...(chain ? ['-af', chain] : []), '-ac', '1', '-map_metadata', '-1', ...(ext === 'ogg' ? ['-c:a', 'libopus', '-b:a', '40k'] : ['-c:a', 'aac', '-b:a', '56k', '-movflags', '+faststart']), file),
  );
}
for (const [name, src, origin] of MUSIC) {
  const gain = (MUSIC_LUFS - loudness(join(raw, src))).toFixed(1);
  ship(name, origin, (ext, file) =>
    ffmpeg('-i', join(raw, src), '-af', `volume=${gain}dB`, '-ac', ext === 'ogg' ? '2' : '1', '-map_metadata', '-1', ...(ext === 'ogg' ? ['-c:a', 'libopus', '-b:a', '30k'] : ['-c:a', 'aac', '-b:a', '36k', '-movflags', '+faststart']), file),
  );
}
for (const [name, src, origin, from, len] of BEDS) {
  const gain = (MUSIC_LUFS - loudness(join(raw, src))).toFixed(1);
  const loop = `[0:a]atrim=${from}:${from + len},asetpts=N/SR/TB,volume=${gain}dB,asplit[a][b];[a]atrim=${XFADE},asetpts=N/SR/TB[body];[b]atrim=0:${XFADE},asetpts=N/SR/TB[head];[body][head]acrossfade=d=${XFADE}:c1=tri:c2=tri`;
  ship(name, origin, (ext, file) =>
    ffmpeg('-i', join(raw, src), '-filter_complex', loop, '-ac', '1', '-map_metadata', '-1', ...(ext === 'ogg' ? ['-c:a', 'libopus', '-b:a', '24k'] : ['-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart']), file),
  );
}
const csv = join(root, 'LICENSES.csv');
const kept = readFileSync(csv, 'utf8').trim().split('\n').filter((r) => !r.startsWith('"audio/'));
writeFileSync(csv, [...kept, ...rows].join('\n') + '\n');
console.log(`${rows.length} audio files`);
