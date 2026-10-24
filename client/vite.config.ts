import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
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
