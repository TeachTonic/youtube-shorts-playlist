import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../.cache/editor/vite',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: { outDir: 'dist', target: 'es2022', rollupOptions: { input: { editor: import.meta.dirname + '/index.html', viewer: import.meta.dirname + '/viewer.html' } } },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'happy-dom' },
});
