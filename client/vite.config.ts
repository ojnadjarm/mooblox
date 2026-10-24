import { defineConfig } from 'vitest/config';

const moodle = process.env['MOOBLOX_MOODLE'] ?? 'http://localhost:8052';

export default defineConfig({
  base: './',
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
