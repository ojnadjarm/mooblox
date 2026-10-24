// Packs the kit into one file: node tools/pack-kit.mjs [srcdir] (default kit-src; the shipped kit is the rounded set from
// tools/round-kit.py).
// Every kit-src/<pack>/<name>.glb becomes one node `<pack>__<name>` of public/assets/kit.glb (tangents dropped: the plastic needs
// none; one buffer, shared colormaps, meshopt-compressed). One request instead of ~100 on first load.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const src = process.argv[2] ?? new URL('../kit-src', import.meta.url).pathname;
const out = new URL('../public/assets/kit.glb', import.meta.url).pathname;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const target = new Document();
const scene = target.createScene('kit');
let count = 0;
for (const pack of readdirSync(src).sort()) {
  for (const file of readdirSync(join(src, pack)).filter((f) => f.endsWith('.glb')).sort()) {
    const source = await io.read(join(src, pack, file));
    const map = mergeDocuments(target, source);
    const wrapper = target.createNode(`${pack}__${file.replace(/\.glb$/, '')}`);
    for (const s of source.getRoot().listScenes()) {
      for (const n of s.listChildren()) wrapper.addChild(map.get(n));
      map.get(s).dispose();
    }
    scene.addChild(wrapper);
    count++;
  }
}
for (const mesh of target.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) prim.setAttribute('TANGENT', null);
}
target.getRoot().setDefaultScene(scene);
await target.transform(dedup(), prune(), unpartition(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
writeFileSync(out, await io.writeBinary(target));
console.log(`${count} models -> ${out}`);
