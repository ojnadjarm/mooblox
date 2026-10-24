// Model footprints for the dressing designer: node tools/footprints.mjs -> src/world/model-footprints.json
// Per kit model (world-space, standing on y = 0): h = height, w = widest side, r = largest distance from the vertical axis.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = new URL('../kit-src/', import.meta.url).pathname;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const out = {};
for (const pack of readdirSync(base).sort()) {
  for (const file of readdirSync(join(base, pack)).filter((f) => f.endsWith('.glb')).sort()) {
    const doc = await io.read(join(base, pack, file));
    const pts = [];
    let tris = 0;
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const idx = prim.getIndices();
        tris += (idx ? idx.getCount() : pos.getCount()) / 3;
        const v = [];
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          pts.push([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]);
        }
      }
    }
    const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
    const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
    const r = Math.max(...pts.map((p) => Math.hypot(p[0], p[2])));
    const round = (x) => Math.round(x * 1000) / 1000;
    out[`${pack}/${file.slice(0, -4)}`] = { h: round(max[1] - min[1]), w: round(Math.max(max[0] - min[0], max[2] - min[2])), r: round(r), tris };
  }
}
writeFileSync(new URL('../src/world/model-footprints.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(Object.keys(out).length, 'models');
