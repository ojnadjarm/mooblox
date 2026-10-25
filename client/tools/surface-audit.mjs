// Surface audit of every kit model: node tools/surface-audit.mjs <outdir> [--prefix after] [--shapes demo,8x12,20x30]
// Lists each model's parts (source material, family, atlas layer drawn, triangles) as shipped and per placed look on every
// tier, flags parts drawn with a layer outside their family (`src/world/kit-materials.ts`), writes `<prefix>.json` and a
// contact sheet `<prefix>-sheet.jpg` (per model: colours | layers, flagged triangles outlined red). Exit 1 when any part is flagged.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/surface-audit.mjs <outdir> [--prefix after] [--shapes demo,8x12,20x30]');
  process.exit(2);
}
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const prefix = opt('prefix', 'after');
const shapes = opt('shapes', 'demo,8x12,20x30').split(',');
mkdirSync(out, { recursive: true });

const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);
const { bakeKit } = await load('/tools/kit-bake.ts');
const { auditMesh, auditPlacement, modelMesh, placementVariants, triangleFamilies } = await load('/src/world/surface-audit.ts');
const { prepDistrict, runPrep } = await load('/src/world/district-prep.ts');
const { Surface } = await load('/src/world/surfaces.ts');
const { designWorld } = await load('/src/world/dressing.ts');
const { IslandLayout } = await load('/src/world/island-layout.ts');
const { CAMPUS } = await load('/src/world/look.ts');
const { parseShape, shapeWorld } = await load('/src/domain/course-shape.ts');
const { toWorld } = await load('/src/domain/mapper.ts');
const fixture = (await load('/test/fixtures/get_world_demo.json')).default;

const NAMES = Object.fromEntries(Object.entries(Surface).map(([k, v]) => [v, k]));
const kit = await bakeKit(new URL('../public/assets/kit.glb', import.meta.url).pathname);
const lib = { get: (id) => kit.get(id).model };
const families = new Map([...kit].map(([id, k]) => [id, triangleFamilies(id, k.model, k.materials)]));
const policy = new IslandLayout(CAMPUS.size);
const worlds = { demo: toWorld(fixture), '8x12': shapeWorld(812, parseShape('8x12')), '20x30': shapeWorld(2030, parseShape('20x30')) };
const placed = new Map();
for (const s of shapes) {
  const w = worlds[s];
  for (const p of placementVariants(designWorld(policy.layout(w), w.courseId, CAMPUS.palette).districts.flatMap((d) => d.placements))) {
    const list = placed.get(p.id) ?? [];
    if (!list.some((q) => q.tint === p.tint && q.roof === p.roof && q.bands?.hi === p.bands?.hi && q.bands?.lo === p.bands?.lo)) list.push(p);
    placed.set(p.id, list);
  }
}

const report = { prefix, models: [] };
let flagged = 0;
let flaggedTris = 0;
for (const [id, k] of kit) {
  const fam = families.get(id);
  const looks = [{ look: 'kit', parts: auditMesh(fam, modelMesh(k.model)) }];
  for (const p of placed.get(id) ?? []) {
    const look = `tint ${p.tint?.toString(16) ?? '-'} roof ${p.roof?.toString(16) ?? '-'}${p.bands ? ` bands ${p.bands.hi.toString(16)}/${p.bands.lo.toString(16)}` : ''}`;
    if (!p.rich) looks.push({ look: `${look} play`, parts: auditPlacement(p, lib, fam, false) });
    looks.push({ look: `${look} xhigh`, parts: auditPlacement(p, lib, fam, true) });
  }
  const bad = looks.flatMap((l) => l.parts.filter((x) => !x.ok).map((x) => ({ look: l.look, ...x, layer: NAMES[x.layer] })));
  flagged += bad.length;
  flaggedTris += bad.reduce((n, b) => n + b.tris, 0);
  report.models.push({ id, placed: placed.has(id), tris: fam.length, looks: looks.map((l) => ({ look: l.look, parts: l.parts.map((x) => ({ ...x, layer: NAMES[x.layer] })) })), flagged: bad });
  for (const b of bad) console.log(`FLAG ${id} [${b.look}] ${b.material} ${b.colour} ${b.family ?? 'no kind'} -> ${b.layer} x${b.tris}`);
}
report.flaggedParts = flagged;
report.flaggedTris = flaggedTris;
report.modelsFlagged = report.models.filter((m) => m.flagged.length).length;
writeFileSync(join(out, `${prefix}.json`), JSON.stringify(report, null, 1));

// Contact sheet: per model the drawn mesh (first placed look on the play tier, else as shipped), colours | layers.
const LAYER_RGB = {
  plain: '#d8dde6', grass: '#7ed957', foliage: '#2f9e44', wood: '#b5763c', rock: '#8a8f99', roof: '#e8590c', plaster: '#fff3cf',
  brick: '#a51d1d', ground: '#8c6239', metal: '#d8dde6', sand: '#f2d675', paving: '#4c6ef5', meadow: '#c0eb75', cliff: '#9c36b5',
  bark: '#5c3a1e', hedge: '#0b5d2c', floor: '#ff922b', cloth: '#22b8cf',
};
const TILE = 210;
const tile = (id, mesh, verts, fam) => {
  const tris = fam.length;
  const yaw = 0.7, pitch = 0.45;
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  const v = (i) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
  const proj = ([x, y, z]) => {
    const rx = x * cy - z * sy, rz = x * sy + z * cy;
    return [rx, y * cp - rz * sp, y * sp + rz * cp];
  };
  const P = [];
  for (let t = 0; t < tris; t++) {
    const idx = [0, 1, 2].map((k) => (mesh.index ? mesh.index[t * 3 + k] : t * 3 + k));
    P.push({ t, idx, pts: idx.map((i) => proj(v(i))) });
  }
  const all = P.flatMap((p) => p.pts);
  const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const s = (TILE - 24) / Math.max(x1 - x0, y1 - y0, 1e-6);
  const ox = (TILE - (x1 - x0) * s) / 2, oy = (TILE - 14 - (y1 - y0) * s) / 2 + 14;
  P.sort((a, b) => a.pts.reduce((n, p) => n + p[2], 0) - b.pts.reduce((n, p) => n + p[2], 0));
  const parts = auditMesh(fam, mesh);
  const okKey = new Set(parts.filter((p) => p.ok).map((p) => `${p.material}|${p.family}|${p.layer}`));
  const cs = mesh.colorSize ?? 3;
  const polys = [[], []];
  let bad = 0;
  for (const p of P) {
    const pts = p.pts.map((q) => `${(ox + (q[0] - x0) * s).toFixed(1)},${(oy + (y1 - q[1]) * s).toFixed(1)}`).join(' ');
    const i = p.idx[2];
    const one = auditMesh([fam[p.t]], { color: Array.from({ length: 3 }, (_, k) => mesh.color[i * cs + k]), normal: [mesh.normal[i * 3], mesh.normal[i * 3 + 1], mesh.normal[i * 3 + 2]], surface: mesh.surface ? [mesh.surface[i]] : null, index: [0, 0, 0] })[0];
    const ok = okKey.has(`${one.material}|${one.family}|${one.layer}`);
    const ny = mesh.normal[i * 3 + 1];
    const shade = 0.62 + 0.38 * Math.max(0, ny * 0.8 + 0.3);
    const lin = [0, 1, 2].map((k) => mesh.color[i * cs + k] * shade);
    const srgb = lin.map((c) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));
    polys[0].push(`<polygon points="${pts}" fill="rgb(${srgb})" stroke="rgb(${srgb})" stroke-width="0.4"/>`);
    const lc = LAYER_RGB[NAMES[one.layer]];
    polys[1].push(`<polygon points="${pts}" fill="${lc}" stroke="${ok ? lc : '#ff0000'}" stroke-width="${ok ? 0.4 : 1.6}" ${ok ? '' : 'fill-opacity="0.85"'}/>`);
    if (!ok) bad++;
  }
  const label = (txt, col) => `<text x="4" y="11" font-family="DejaVu Sans" font-size="10" fill="${col}">${txt}</text>`;
  const svg = (body, txt, col) => `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}"><rect width="100%" height="100%" fill="#f4f1ea"/>${body}${label(txt, col)}</svg>`;
  return {
    bad,
    svgs: [svg(polys[0].join(''), `${id} ${tris} tris`, '#333'), svg(polys[1].join(''), bad ? `${bad} tris flagged` : 'layers ok', bad ? '#d00' : '#2b8a3e')],
  };
};
const tiles = [];
for (const [id, k] of kit) {
  const fam = families.get(id);
  const p = (placed.get(id) ?? []).find((q) => !q.rich);
  let mesh = modelMesh(k.model);
  let verts = k.model.geometry.getAttribute('position').array;
  if (p) {
    const m = runPrep(prepDistrict({ terrain: [], placements: [{ ...p, x: 0, z: 0, yaw: 0 }], blockers: [], minor: true, rich: false, solids: false, detail: true }, lib)).meshes.find((x) => x);
    mesh = m;
    verts = m.position;
  }
  const t = tile(id, mesh, verts, fam);
  for (const s of t.svgs) tiles.push(await sharp(Buffer.from(s)).png().toBuffer());
}
const COLS = 8;
const rows = Math.ceil(tiles.length / COLS);
const legendH = 60;
const legend = `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * TILE}" height="${legendH}"><rect width="100%" height="100%" fill="#fff"/>${Object.entries(LAYER_RGB)
  .filter(([n]) => n !== 'metal')
  .map(([n, c], i) => `<rect x="${8 + (i % 9) * 150}" y="${8 + Math.floor(i / 9) * 22}" width="14" height="14" fill="${c}" stroke="#555"/><text x="${26 + (i % 9) * 150}" y="${20 + Math.floor(i / 9) * 22}" font-family="DejaVu Sans" font-size="12">${n === 'plain' ? 'unpainted' : n}</text>`)
  .join('')}<text x="${8 + 9 * 150}" y="20" font-family="DejaVu Sans" font-size="12" fill="#d00">red edge = flagged</text></svg>`;
await sharp({ create: { width: COLS * TILE, height: rows * TILE + legendH, channels: 3, background: '#ffffff' } })
  .composite([{ input: await sharp(Buffer.from(legend)).png().toBuffer(), left: 0, top: 0 }, ...tiles.map((input, i) => ({ input, left: (i % COLS) * TILE, top: legendH + Math.floor(i / COLS) * TILE }))])
  .jpeg({ quality: 82 })
  .toFile(join(out, `${prefix}-sheet.jpg`));
console.log(`${kit.size} models, ${placed.size} placed, ${[...placed.values()].reduce((n, l) => n + l.length, 0)} placed looks; flagged ${flagged} parts, ${flaggedTris} tris, ${report.modelsFlagged} models -> ${join(out, `${prefix}-sheet.jpg`)}`);
await server.close();
process.exit(flagged ? 1 : 0);
