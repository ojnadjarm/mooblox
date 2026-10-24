import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { BOOT_MODELS } from './src/boot/boot-assets';

const moodle = process.env['MOOBLOX_MOODLE'] ?? 'http://localhost:8052';

/** Writes `assets/<model>.gz` beside each boot model: web servers rarely compress glb, `boot/asset-preload.ts` inflates them. */
function gzipBootModels(): Plugin {
  let outDir = '';
  return {
    name: 'mooblox-gzip-boot-models',
    apply: 'build',
    configResolved: (c) => void (outDir = c.build.outDir),
    closeBundle() {
      for (const f of BOOT_MODELS) writeFileSync(join(outDir, 'assets', `${f}.gz`), gzipSync(readFileSync(join(outDir, 'assets', f)), { level: 9 }));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [gzipBootModels()],
  server: {
    proxy: Object.fromEntries(['/theme', '/mod', '/pluginfile.php'].map((path) => [path, { target: moodle, changeOrigin: true }])),
  },
  build: {
    outDir: '../moodle/local/mooblox/client/dist',
    emptyOutDir: true,
    target: 'es2022',
    rolldownOptions: {
      input: 'src/boot/main.ts',
      output: {
        entryFileNames: 'mooblox.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
