import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DefaultLoadingManager } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inflated, preloadAssets } from '../../src/boot/asset-preload';

const glb = readFileSync(join(__dirname, '../../public/assets/kenney-blocky.glb'));
const serve = (body: Uint8Array | string, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body as BodyInit, { status })));

describe('asset preload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    DefaultLoadingManager.setURLModifier(undefined);
  });

  it('inflates the gzip copy to the original glb', async () => {
    serve(gzipSync(glb));
    const blob = await inflated('/assets/kenney-blocky.glb');
    expect(Buffer.from(await blob!.arrayBuffer()).equals(glb)).toBe(true);
  });

  it('takes a copy the server already inflated as it is', async () => {
    serve(glb);
    expect((await inflated('/a.glb'))!.size).toBe(glb.length);
  });

  it('gives up on a missing copy or an html fallback page', async () => {
    serve('nope', 404);
    expect(await inflated('/a.glb')).toBeNull();
    serve('<!doctype html><html></html>');
    expect(await inflated('/a.glb')).toBeNull();
  });

  it('points three.js loaders at the inflated bytes, other urls unchanged', async () => {
    serve(gzipSync(glb));
    await preloadAssets('/assets/', ['kit.glb']);
    expect(DefaultLoadingManager.resolveURL('/assets/kit.glb')).toMatch(/^blob:/);
    expect(DefaultLoadingManager.resolveURL('/assets/pets.glb')).toBe('/assets/pets.glb');
  });
});
